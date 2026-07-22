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
  // A capability is `{id, label}` — the id namespaced to THIS helper, the label the
  // sentence the admin reads before installing. Bare strings were the 1.5.0 shape.
  provides: [{ id: "filesystem:write", label: "Read and write files in folders you choose" }],
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

  /**
   * THE REGRESSION THIS FEATURE EXISTS TO PREVENT (1.5.1).
   *
   * `provides` used to be filtered against the four core permissions, so a filesystem
   * helper declaring `files:write` had it SILENTLY DROPPED — the helper installed, the
   * module got filesystem access through it, and the consent screen said nothing. That is
   * "consent bypassable by proxy" failing quietly, which is the one property MOD-08 rests
   * on. A malformed `provides` must now refuse the HELPER, loudly and completely.
   */
  it("REFUSES a helper whose `provides` is the old bare-string shape", async () => {
    mockManifest(manifest({ helpers: [{ ...HELPER_ENTRY, provides: ["files:write"] }] }));
    const m = await fetchSourceManifest(OFFICIAL, "beta");
    expect(m.helpers).toEqual([]); // refused, NOT installed with the capability dropped
  });

  it("refuses a capability whose namespace isn't the helper's own id", async () => {
    // Otherwise a helper could describe — and appear to grant — someone else's capability,
    // or shadow a core permission with wording of its choosing.
    for (const bad of [
      { id: "other:write", label: "Write files" },
      { id: "crypto:use", label: "Totally harmless, promise" },
      { id: "filesystem", label: "No verb" },
      { id: "filesystem:write", label: "" },
      { id: "filesystem:write" },
      "filesystem:write",
    ]) {
      mockManifest(manifest({ helpers: [{ ...HELPER_ENTRY, provides: [bad] }] }));
      const m = await fetchSourceManifest(OFFICIAL, "beta");
      expect(m.helpers, JSON.stringify(bad)).toEqual([]);
    }
  });

  it("keeps the label so the consent screen can render it", async () => {
    mockManifest(manifest({ helpers: [HELPER_ENTRY] }));
    const m = await fetchSourceManifest(OFFICIAL, "beta");
    expect(m.helpers[0].provides).toEqual([
      { id: "filesystem:write", label: "Read and write files in folders you choose" },
    ]);
  });

  it("still accepts a helper that provides nothing (the scheduler's shape)", async () => {
    // `scheduler` ships `provides: []` on both live channels — this asserts the published
    // manifests keep parsing unchanged across the schema change.
    mockManifest(manifest({ helpers: [{ ...HELPER_ENTRY, id: "scheduler", path: "helpers/scheduler", tag: "scheduler/v0.0.2", provides: [] }] }));
    const m = await fetchSourceManifest(OFFICIAL, "beta");
    expect(m.helpers.map((h) => h.id)).toEqual(["scheduler"]);
    expect(m.helpers[0].provides).toEqual([]);
  });

  it("builds the pinned tag archive URL both installers use", () => {
    expect(archiveUrlForRepo(OFFICIAL, "scheduler/v0.0.1-beta.1")).toBe(
      `${OFFICIAL}/archive/refs/tags/scheduler/v0.0.1-beta.1.zip`,
    );
    expect(() => archiveUrlForRepo("https://evil.example.com/a/b", "v1")).toThrow();
  });
});
