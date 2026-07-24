import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * REGRESSION (BUG-38, 2026-07-23). Reported by the owner: after uninstalling Backup Manager,
 * the filesystem helper was gone from Admin → Helpers but still listed under Admin → Updates,
 * with a working beta switch.
 *
 * The uninstall was correct — `pruneUnusedHelpers` removed the helper's FILES and dropped it
 * from the generated registry. What remained was its database ROW, which is kept on purpose so
 * reinstalling the module restores the helper's data rather than starting it from nothing.
 *
 * The fault was that the two pages disagreed about what "installed" means:
 *   listHelpersForAdmin  → iterates the REGISTRY and looks rows up  → correct
 *   getHelperUpdateStatus → iterated ALL ROWS                       → included orphans
 *
 * So a helper whose files were deleted kept a channel switch and could be offered an update.
 *
 * Source-level on purpose: reproducing it needs an installed module, its helper, an uninstall
 * and a rebuild. The invariant worth protecting is simply "this reader is registry-gated".
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("installed means files on disk, not a row in the database", () => {
  it("getHelperUpdateStatus is gated on the registry, not on rows alone", () => {
    const src = read("lib/helpers/updates.ts");
    expect(src).toContain("getAllHelpers");
    // The row query must be filtered by what is actually installed.
    expect(src).toMatch(/prisma\.helper\.findMany\(\)\)\.filter/);
  });

  it("listHelpersForAdmin still drives off the registry", () => {
    // The reader that was already right — if this regresses, both pages are wrong and
    // nothing is left to disagree with, which is how the bug would go unnoticed.
    const src = read("lib/helpers/registry.ts");
    const body = src.slice(src.indexOf("export async function listHelpersForAdmin"));
    expect(body).toContain("getAllHelpers()");
  });

  it("uninstalling a module still only prunes helper FILES, never its data", () => {
    // The row outliving the files is deliberate, not the bug. If this ever changes to
    // delete rows, a reinstall silently loses the helper's history.
    const src = read("lib/helpers/install.ts");
    const body = src.slice(src.indexOf("export function pruneUnusedHelpers"));
    expect(body).not.toContain("prisma.helper.delete");
    expect(body).not.toContain("prisma.helper.deleteMany");
  });
});
