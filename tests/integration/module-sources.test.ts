import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  parseRepoUrl,
  manifestUrlFor,
  fetchSourceManifest,
  addSource,
  removeSource,
  setSourceEnabled,
  listSources,
  ensureDefaultSource,
  browseAvailableModules,
  SourceError,
  DEFAULT_SOURCE_URL,
} from "@/lib/modules/sources";

const REPO = "https://github.com/jontiadcock/JonDash-addons";

function validEntry(over: Record<string, unknown> = {}) {
  return {
    id: "health-monitor",
    name: "Health monitoring",
    description: "Checks your services.",
    version: "1.0.0",
    minAppVersion: "1.5.0",
    permissions: ["network:outbound"],
    path: "addons/health-monitor",
    tag: "health-monitor/v1.0.0",
    ...over,
  };
}

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })),
  );
}

async function cleanup() {
  await prisma.moduleSource.deleteMany();
  await prisma.module.deleteMany();
}

beforeEach(cleanup);
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("module sources", () => {
  it("parses GitHub repo URLs and rejects anything else", () => {
    expect(parseRepoUrl(REPO)).toEqual({ owner: "jontiadcock", repo: "JonDash-addons" });
    expect(parseRepoUrl(`${REPO}.git`)).toEqual({ owner: "jontiadcock", repo: "JonDash-addons" });
    expect(parseRepoUrl("http://github.com/a/b")).toBeNull(); // not https
    expect(parseRepoUrl("https://gitlab.com/a/b")).toBeNull(); // not github (yet)
    expect(parseRepoUrl("https://github.com/onlyowner")).toBeNull();
    expect(parseRepoUrl("not a url")).toBeNull();
  });

  it("builds the raw manifest URL per channel (main = stable, beta = beta)", () => {
    expect(manifestUrlFor(REPO, "stable")).toBe(
      "https://raw.githubusercontent.com/jontiadcock/JonDash-addons/main/addons.json",
    );
    expect(manifestUrlFor(REPO, "beta")).toBe(
      "https://raw.githubusercontent.com/jontiadcock/JonDash-addons/beta/addons.json",
    );
    expect(manifestUrlFor("https://example.com/x", "stable")).toBeNull();
  });

  it("parses a valid manifest", async () => {
    mockFetch({ manifestVersion: 1, channel: "stable", name: "Official", modules: [validEntry()] });
    const m = await fetchSourceManifest(REPO, "stable");
    expect(m.name).toBe("Official");
    expect(m.modules).toHaveLength(1);
    expect(m.modules[0]).toMatchObject({ id: "health-monitor", version: "1.0.0", tag: "health-monitor/v1.0.0" });
  });

  it("drops untrusted/invalid entries instead of trusting them", async () => {
    mockFetch({
      manifestVersion: 1,
      channel: "stable",
      modules: [
        validEntry(),
        validEntry({ id: "Bad Id!" }), // invalid slug
        validEntry({ id: "badver", version: "not-semver", tag: "badver/v1" }),
        validEntry({ id: "traversal", path: "../../etc", tag: "traversal/v1.0.0" }), // path escape
        validEntry({ id: "mismatch", path: "addons/other", tag: "mismatch/v1.0.0" }), // path != id
        validEntry({ id: "notag", tag: "" }),
      ],
    });
    const m = await fetchSourceManifest(REPO, "stable");
    expect(m.modules.map((x) => x.id)).toEqual(["health-monitor"]);
  });

  // CONTRACT CHANGE (1.5.1): permissions used to be silently FILTERED to the core taxonomy.
  // They are now validated by shape and a bad one refuses the whole entry. Silent filtering
  // is what let a helper's capabilities vanish from the consent screen, so it is gone
  // everywhere, not just for helpers.
  it("accepts core and helper-namespaced permissions", async () => {
    mockFetch({
      manifestVersion: 1,
      channel: "stable",
      modules: [validEntry({ permissions: ["network:outbound", "filesystem:write", "crypto:use"] })],
    });
    const m = await fetchSourceManifest(REPO, "stable");
    expect(m.modules[0].permissions).toEqual(["network:outbound", "filesystem:write", "crypto:use"]);
  });

  it("REFUSES an entry with a malformed permission rather than dropping it", async () => {
    mockFetch({
      manifestVersion: 1,
      channel: "stable",
      modules: [validEntry({ permissions: ["network:outbound", "not a permission"] })],
    });
    const m = await fetchSourceManifest(REPO, "stable");
    // The whole module is gone, not quietly installed minus a permission. A dropped
    // permission that happens to match the code installs with consent missing.
    expect(m.modules).toEqual([]);
  });

  it("refuses a permission that is neither core nor `<helper>:<verb>`", async () => {
    for (const bad of ["files", "Files:Write", "filesystem:", ":write", "file system:write", 42]) {
      mockFetch({
        manifestVersion: 1,
        channel: "stable",
        modules: [validEntry({ permissions: [bad] })],
      });
      const m = await fetchSourceManifest(REPO, "stable");
      expect(m.modules, JSON.stringify(bad)).toEqual([]);
    }
  });

  it("rejects a newer manifest version, a 404 channel, and bad JSON", async () => {
    mockFetch({ manifestVersion: 99, modules: [] });
    await expect(fetchSourceManifest(REPO, "stable")).rejects.toThrow(/newer version/i);

    mockFetch("", 404);
    await expect(fetchSourceManifest(REPO, "beta")).rejects.toThrow(/beta branch|no .*addons\.json/i);

    mockFetch("{not json", 200);
    await expect(fetchSourceManifest(REPO, "stable")).rejects.toThrow(/valid JSON/i);
  });

  it("seeds the default source once, and doesn't resurrect it after deliberate removal", async () => {
    await ensureDefaultSource();
    let sources = await listSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe(DEFAULT_SOURCE_URL);
    expect(sources[0].isDefault).toBe(true);

    await ensureDefaultSource(); // idempotent
    expect(await listSources()).toHaveLength(1);

    // Remove it, then add a different source: the default must NOT come back.
    await removeSource(sources[0].id);
    mockFetch({ manifestVersion: 1, channel: "stable", name: "Mine", modules: [] });
    await addSource("https://github.com/someone/their-addons");
    await ensureDefaultSource();
    sources = await listSources();
    expect(sources.map((s) => s.url)).toEqual(["https://github.com/someone/their-addons"]);
  });

  it("addSource validates the URL, verifies the manifest, and de-duplicates", async () => {
    await expect(addSource("https://gitlab.com/a/b")).rejects.toThrow(SourceError);

    mockFetch({ manifestVersion: 1, channel: "stable", name: "Official", modules: [] });
    const created = await addSource(REPO);
    expect(created.url).toBe(REPO);
    expect(created.name).toBe("Official");

    await expect(addSource(`${REPO}.git`)).rejects.toThrow(/already added/i); // normalised + de-duped
  });

  it("browse lists modules from enabled sources only, flagging installed ones", async () => {
    mockFetch({ manifestVersion: 1, channel: "stable", name: "Official", modules: [] });
    const src = await addSource(REPO);

    mockFetch({ manifestVersion: 1, channel: "stable", modules: [validEntry()] });
    await prisma.module.create({
      data: { id: "health-monitor", name: "Health monitoring", version: "0.9.0", enabled: true },
    });

    let out = await browseAvailableModules("stable");
    expect(out.modules).toHaveLength(1);
    expect(out.modules[0]).toMatchObject({ id: "health-monitor", installed: true, installedVersion: "0.9.0" });
    expect(out.errors).toHaveLength(0);

    // Disabled sources are skipped entirely.
    await setSourceEnabled(src.id, false);
    out = await browseAvailableModules("stable");
    expect(out.modules).toHaveLength(0);
  });

  it("surfaces a failing source as an error without breaking the others", async () => {
    mockFetch({ manifestVersion: 1, channel: "stable", name: "Official", modules: [] });
    await addSource(REPO);
    mockFetch("", 500); // source now unreachable
    const out = await browseAvailableModules("stable");
    expect(out.modules).toHaveLength(0);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].message).toMatch(/couldn't/i);
  });

  it("module channel defaults to stable and can be switched per module", async () => {
    await prisma.module.create({ data: { id: "sample", name: "Sample", version: "1.0.0" } });
    expect((await prisma.module.findUnique({ where: { id: "sample" } }))?.channel).toBe("stable");
    await prisma.module.updateMany({ where: { id: "sample" }, data: { channel: "beta" } });
    expect((await prisma.module.findUnique({ where: { id: "sample" } }))?.channel).toBe("beta");
  });
});
