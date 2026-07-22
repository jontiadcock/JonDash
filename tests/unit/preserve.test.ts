import { describe, it, expect } from "vitest";
import { isPreserved, PRESERVE } from "@/scripts/preserve.mjs";

/**
 * REGRESSION (2026-07-22): this rule decides what an update or rollback must NOT copy
 * over. It used to match a bare entry NAME at any depth, so `lib/modules/` — the entire
 * module framework — collided with the top-level `modules/` add-ons folder and was
 * silently skipped. An update then shipped an app whose framework files were missing;
 * the rollback deleted `lib/` and couldn't restore them either, leaving an install that
 * could not build at all. Only the FIRST path segment may ever match.
 */
describe("update/rollback preserve rule", () => {
  it("preserves user data and regenerables at the top level", () => {
    for (const p of [".env", ".data", "uploads", "modules", "node_modules", ".next", ".git", "logs"]) {
      expect(isPreserved(p), p).toBe(true);
      expect(isPreserved(`${p}/something/deep.txt`), p).toBe(true);
    }
  });

  it("does NOT preserve a nested folder that merely shares a preserved name", () => {
    // The exact bug: lib/modules is core code and MUST be copied by an update.
    expect(isPreserved("lib/modules")).toBe(false);
    expect(isPreserved("lib/modules/registry.ts")).toBe(false);
    expect(isPreserved("lib/modules/generated.ts")).toBe(false);
    // Same class of collision elsewhere in the tree.
    expect(isPreserved("app/admin/modules/page.tsx")).toBe(false);
    expect(isPreserved("docs/uploads.md")).toBe(false);
    expect(isPreserved("app/logs/route.ts")).toBe(false);
  });

  it("handles Windows separators (the launcher builds paths with path.join)", () => {
    expect(isPreserved("lib\\modules\\registry.ts")).toBe(false);
    expect(isPreserved(".data\\secrets.json")).toBe(true);
    expect(isPreserved("modules\\health-monitor\\module.ts")).toBe(true);
  });

  it("copies ordinary source files", () => {
    for (const p of ["package.json", "app/page.tsx", "lib/db.ts", "scripts/update.mjs", "prisma/schema.prisma"]) {
      expect(isPreserved(p), p).toBe(false);
    }
  });

  it("is safe on empty input", () => {
    expect(isPreserved("")).toBe(false);
  });

  it("keeps exactly the intended top-level entries", () => {
    // A new entry here silently changes what updates overwrite — make it deliberate.
    expect([...PRESERVE].sort()).toEqual(
      [".data", ".env", ".git", ".next", "logs", "modules", "node_modules", "uploads"].sort(),
    );
  });
});
