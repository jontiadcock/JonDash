import { describe, it, expect } from "vitest";
import { parseDeclaredHelpers } from "@/lib/modules/verify";
import { helperIdsOf, helperNeedId } from "@/lib/modules/types";

/**
 * A module's `helpers` may be a bare id or `{ id, minVersion }` (MOD-10). Both forms must
 * work everywhere, because the object form is additive — every module published to date
 * uses bare strings and must keep working untouched.
 */

const MOD = (helpers: string) => `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.5.2",
  permissions: [], helpers: ${helpers},
};
export default mod;`;

describe("parsing a module's declared helpers", () => {
  it("reads the bare form — every module published so far", () => {
    expect(parseDeclaredHelpers(MOD(`["scheduler"]`))).toEqual(["scheduler"]);
    expect(parseDeclaredHelpers(MOD(`["scheduler", "filesystem"]`))).toEqual(["scheduler", "filesystem"]);
  });

  it("reads the object form without mistaking the version for a helper", () => {
    // The old parser scanned for any quoted slug and only avoided picking up "0.0.3" by
    // the accident that versions contain dots. Assert the intent, not the accident.
    expect(parseDeclaredHelpers(MOD(`[{ id: "scheduler", minVersion: "0.0.3" }]`))).toEqual(["scheduler"]);
  });

  it("does not invent a helper from a quoted KEY", () => {
    // `{ "id": "scheduler" }` used to yield a phantom helper called "id", which would then
    // be reported missing and block the install for a reason nobody could act on.
    expect(parseDeclaredHelpers(MOD(`[{ "id": "scheduler", "minVersion": "1.0.0" }]`))).toEqual(["scheduler"]);
  });

  it("handles the two forms mixed together", () => {
    const got = parseDeclaredHelpers(MOD(`["scheduler", { id: "filesystem", minVersion: "0.2.0" }]`));
    expect(got.sort()).toEqual(["filesystem", "scheduler"]);
  });

  it("returns nothing when a module declares none", () => {
    expect(parseDeclaredHelpers(`const mod = { id: "demo", permissions: [] };`)).toEqual([]);
  });

  it("ignores a commented-out helpers example (BUG-39)", () => {
    // A worked example left in a comment must not become a real dependency — it would
    // install that helper, or (if it isn't published on the module's channel) roll the whole
    // module back at install. This is the same class as matching "eval" in a README.
    const alongsideAComment = `
const mod = {
  id: "demo", permissions: [],
  helpers: ["scheduler"],
  // helpers: ["filesystem", "scheduler"],  example — not used
};`;
    expect(parseDeclaredHelpers(alongsideAComment)).toEqual(["scheduler"]);

    // A fully commented-out declaration means NO helpers, not a phantom one.
    expect(
      parseDeclaredHelpers(`const mod = {\n  id: "demo", permissions: [],\n  // helpers: ["scheduler"],\n};`),
    ).toEqual([]);

    // A line comment INSIDE the array is stripped, leaving only the real entry.
    const inArray = `
const mod = {
  helpers: [
    "scheduler", // the one it needs
    // "filesystem", only an example
  ],
};`;
    expect(parseDeclaredHelpers(inArray)).toEqual(["scheduler"]);
  });
});

describe("helperIdsOf / helperNeedId", () => {
  it("normalises both forms to plain ids", () => {
    expect(helperIdsOf(["scheduler"])).toEqual(["scheduler"]);
    expect(helperIdsOf([{ id: "filesystem", minVersion: "1.0.0" }])).toEqual(["filesystem"]);
    expect(helperIdsOf(["scheduler", { id: "filesystem" }])).toEqual(["scheduler", "filesystem"]);
    expect(helperIdsOf(undefined)).toEqual([]);
  });

  it("is what callers must use instead of Array.includes", () => {
    // `.includes("filesystem")` on a (string | ModuleHelperNeed)[] COMPILES — the union
    // accepts a string argument — and silently never matches the object form. Every
    // dependent lookup would come back empty: no consent roll-up, no pruning, no channel
    // derivation. It's the sort of bug the type system waves through, so it gets a test.
    const declared = [{ id: "filesystem", minVersion: "1.0.0" }];
    expect(declared.includes("filesystem" as never)).toBe(false);
    expect(helperIdsOf(declared).includes("filesystem")).toBe(true);
  });

  it("reads a single need either way", () => {
    expect(helperNeedId("scheduler")).toBe("scheduler");
    expect(helperNeedId({ id: "scheduler", minVersion: "0.0.3" })).toBe("scheduler");
  });
});
