import { describe, it, expect } from "vitest";
import { sanitiseModuleEntryForTest, MAX_SCREENSHOTS } from "@/lib/modules/sources";

/**
 * Screenshot entries from a source manifest (8.2).
 *
 * **`file` becomes part of a URL that core then fetches**, and a manifest is written by somebody
 * else — for a third-party source, by somebody with no relationship to this install. So the
 * interesting tests are not "does a good filename work" but "what happens with the ones an attacker
 * would actually write".
 * REFS lib/modules/sources.ts
 */
const base = {
  id: "demo",
  name: "Demo",
  description: "A module",
  version: "1.0.0",
  minAppVersion: "1.0.0",
  permissions: [],
  helpers: [],
  path: "addons/demo",
  tag: "demo/v1.0.0",
};

const shotsOf = (screenshots: unknown) =>
  sanitiseModuleEntryForTest({ ...base, screenshots })?.screenshots ?? [];

describe("screenshot entries from a manifest", () => {
  it("keeps a plain filename and its caption", () => {
    expect(shotsOf([{ file: "dashboard.png", caption: "The widget" }])).toEqual([
      { file: "dashboard.png", caption: "The widget" },
    ]);
  });

  it("accepts the three agreed formats and nothing else", () => {
    expect(shotsOf([{ file: "a.png" }, { file: "b.jpg" }, { file: "c.jpeg" }, { file: "d.webp" }])).
      toHaveLength(4);
    expect(shotsOf([{ file: "x.svg" }])).toEqual([]);
    expect(shotsOf([{ file: "x.gif" }])).toEqual([]);
    // An SVG is a document that can carry script, which is why it is not on the list.
    expect(shotsOf([{ file: "x.html" }])).toEqual([]);
  });

  /**
   * One subdirectory is allowed — the add-ons session was told `screenshots/jobs.webp` in round 2,
   * 1.8.0 silently narrowed it to filename-only, and they caught it on review before publishing.
   * Four loose images among a module's source files is worse for an author than one folder.
   */
  it("allows a single subdirectory", () => {
    expect(shotsOf([{ file: "screenshots/dashboard.png" }])).toEqual([
      { file: "screenshots/dashboard.png" },
    ]);
    expect(shotsOf([{ file: "dashboard.png" }])).toEqual([{ file: "dashboard.png" }]);
  });

  it("refuses anything that is more than one subdirectory, or escapes at all", () => {
    for (const file of [
      "../secrets.png",
      "../../../etc/passwd.png",
      "screenshots/../../../etc/passwd.png",
      "sub/dir/shot.png",
      "/etc/shot.png",
      "C:\\windows\\shot.png",
      ".hidden.png",
      "./shot.png",
      "screenshots//shot.png",
    ]) {
      expect(shotsOf([{ file }]), `accepted a path: ${file}`).toEqual([]);
    }
  });

  it("refuses a filename carrying a query or fragment", () => {
    // These would otherwise ride into the constructed URL and change what gets fetched.
    expect(shotsOf([{ file: "shot.png?x=1" }])).toEqual([]);
    expect(shotsOf([{ file: "shot.png#frag" }])).toEqual([]);
    expect(shotsOf([{ file: "shot.png " }])).toEqual([{ file: "shot.png" }]); // trimmed, not rejected
  });

  it("caps the count, because every install downloads them", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ file: `s${i}.png` }));
    expect(shotsOf(many)).toHaveLength(MAX_SCREENSHOTS);
  });

  it("caps a caption at 80 characters and strips control characters", () => {
    const shots = shotsOf([{ file: "a.png", caption: "x".repeat(200) }]);
    expect(shots[0]!.caption).toHaveLength(80);
    const sneaky = shotsOf([{ file: "a.png", caption: "line\u0000one\u001b[31m" }]);
    expect(sneaky[0]!.caption).toBe("lineone[31m");
  });

  it("drops a bad entry without losing the good ones, or the module", () => {
    // A picture is the least important thing a module has: refusing to list the module because one
    // filename is wrong would be wildly out of proportion.
    const shots = shotsOf([{ file: "../bad.png" }, { file: "good.png" }, { file: 42 }]);
    expect(shots).toEqual([{ file: "good.png" }]);
    expect(sanitiseModuleEntryForTest({ ...base, screenshots: [{ file: "../bad.png" }] })).not.toBeNull();
  });

  it("leaves screenshots off entirely when there are none", () => {
    expect(sanitiseModuleEntryForTest(base)).not.toHaveProperty("screenshots");
    expect(sanitiseModuleEntryForTest({ ...base, screenshots: "nope" })).not.toHaveProperty("screenshots");
  });
});
