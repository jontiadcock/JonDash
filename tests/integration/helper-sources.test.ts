import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { fetchSourceManifest, isOfficialSource, DEFAULT_SOURCE_URL, archiveUrlForRepo } from "@/lib/modules/sources";

/**
 * Helpers are trusted to do what modules are forbidden — filesystem, process spawning,
 * raw sockets. The ONLY thing making that safe is that they can come from the official
 * source and nowhere else. If this restriction ever fails, publishing a `helpers` array
 * inherits that privilege, and every module restriction becomes bypassable.
 *
 * So it is enforced in the manifest parser, and tested here rather than trusted.
 */

const OFFICIAL = DEFAULT_SOURCE_URL;
const THIRD_PARTY = "https://github.com/someone-else/their-addons";

function manifest(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    manifestVersion: 1,
    channel: "beta",
    name: "Test source",
    modules: [],
    ...extra,
  });
}

const HELPER_ENTRY = {
  id: "filesystem",
  name: "Filesystem",
  description: "reads and writes files",
  version: "1.0.0",
  minAppVersion: "1.5.0",
  provides: ["network:outbound"],
  path: "helpers/filesystem",
  tag: "filesystem/v1.0.0",
};

function mockManifest(body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status: 200 })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe("helpers are first-party only", () => {
  it("accepts helpers from the official source", async () => {
    mockManifest(manifest({ helpers: [HELPER_ENTRY] }));
    const m = await fetchSourceManifest(OFFICIAL, "beta");
    expect(m.helpers.map((h) => h.id)).toEqual(["filesystem"]);
  });

  it("IGNORES helpers offered by any other source", async () => {
    mockManifest(manifest({ helpers: [HELPER_ENTRY] }));
    const m = await fetchSourceManifest(THIRD_PARTY, "beta");
    expect(m.helpers).toEqual([]); // silently dropped — never trusted
  });

  it("recognises the official source regardless of case or trailing slash", () => {
    expect(isOfficialSource(OFFICIAL)).toBe(true);
    expect(isOfficialSource(`${OFFICIAL}/`)).toBe(true);
    expect(isOfficialSource(OFFICIAL.toUpperCase())).toBe(true);
    expect(isOfficialSource(THIRD_PARTY)).toBe(false);
    // A lookalike must not pass.
    expect(isOfficialSource("https://github.com/jontiadcock/JonDash-addons-evil")).toBe(false);
  });

  it("refuses a helper entry whose path escapes helpers/<id>", async () => {
    mockManifest(manifest({ helpers: [{ ...HELPER_ENTRY, path: "helpers/../../etc" }] }));
    expect((await fetchSourceManifest(OFFICIAL, "beta")).helpers).toEqual([]);
  });

  it("refuses a helper entry with a bad id, version or tag", async () => {
    for (const bad of [
      { ...HELPER_ENTRY, id: "../evil" },
      { ...HELPER_ENTRY, version: "not-a-version" },
      { ...HELPER_ENTRY, tag: "" },
      { ...HELPER_ENTRY, tag: "has space" },
    ]) {
      mockManifest(manifest({ helpers: [bad] }));
      expect((await fetchSourceManifest(OFFICIAL, "beta")).helpers, JSON.stringify(bad)).toEqual([]);
    }
  });

  it("strips a permission that isn't in the taxonomy from `provides`", async () => {
    mockManifest(manifest({ helpers: [{ ...HELPER_ENTRY, provides: ["network:outbound", "make:coffee"] }] }));
    const m = await fetchSourceManifest(OFFICIAL, "beta");
    expect(m.helpers[0].provides).toEqual(["network:outbound"]);
  });

  it("builds the pinned tag archive URL both installers use", () => {
    expect(archiveUrlForRepo(OFFICIAL, "scheduler/v0.0.1-beta.1")).toBe(
      `${OFFICIAL}/archive/refs/tags/scheduler/v0.0.1-beta.1.zip`,
    );
    expect(() => archiveUrlForRepo("https://evil.example.com/a/b", "v1")).toThrow();
  });
});
