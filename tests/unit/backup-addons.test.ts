import { describe, it, expect } from "vitest";
import { decideAddonRestore, restoreAddonTables } from "@/lib/backup-addons";

/**
 * OPS-16 — a module's and a helper's own tables in a backup, and the rule that keeps that safe.
 *
 * The rule is the feature. Carrying the data is easy; the hard part is refusing to write it back
 * into a schema that has moved on, and **saying so** rather than leaving an admin to notice months
 * later that their history is missing.
 */
describe("deciding whether an add-on's data may be restored", () => {
  const dump = { kind: "module" as const, id: "health-monitor", version: "0.0.7" };

  it("restores when the installed version is exactly the backup's", () => {
    expect(decideAddonRestore(dump, "0.0.7")).toEqual({ restore: true });
  });

  it("refuses when the add-on isn't installed, and says so", () => {
    const res = decideAddonRestore(dump, undefined);
    expect(res.restore).toBe(false);
    if (!res.restore) expect(res.reason).toMatch(/isn’t installed here/);
  });

  /**
   * Strict equality, in both directions. Neither "newer is fine" nor "same major is fine" is
   * knowable by core: an add-on author cannot tell it whether a patch release moved a column, and
   * the failure from guessing wrong is a corrupted module rather than a missing one.
   */
  it("refuses a NEWER installed version, not just an older one", () => {
    const res = decideAddonRestore(dump, "0.0.8");
    expect(res.restore).toBe(false);
    if (!res.restore) {
      expect(res.reason).toContain("0.0.8");
      expect(res.reason).toContain("0.0.7");
      // The message has to be actionable: it names the version to install to get the data back.
      expect(res.reason).toMatch(/Install 0\.0\.7 and restore again/);
    }
  });

  it("refuses an older installed version", () => {
    expect(decideAddonRestore(dump, "0.0.6").restore).toBe(false);
  });

  it("treats a helper the same way, and calls it what the UI calls it", () => {
    const res = decideAddonRestore({ kind: "helper", id: "mcp", version: "1.0.0" }, "1.1.0");
    expect(res.restore).toBe(false);
    // "Shared capabilities" is the user-facing name for helpers (CORE-10) — a report that said
    // "helper" would be talking about something the admin has never seen named that.
    if (!res.restore) expect(res.reason).toMatch(/Shared capability/);
  });
});

describe("restoring add-on tables", () => {
  it("reports every skipped add-on rather than failing or staying silent", async () => {
    // Nothing is installed in the test registry, so every dump takes the not-installed path —
    // which is exactly the case that must produce a report instead of a silent no-op.
    const report = await restoreAddonTables([
      { kind: "module", id: "health-monitor", version: "0.0.7", tables: [{ name: "checks", rows: [] }] },
      { kind: "helper", id: "mcp", version: "1.0.0", tables: [{ name: "keys", rows: [] }] },
    ]);
    expect(report.restored).toEqual([]);
    expect(report.skipped).toHaveLength(2);
    expect(report.skipped.join(" ")).toMatch(/health-monitor/);
    expect(report.skipped.join(" ")).toMatch(/mcp/);
  });

  it("is a no-op with nothing to do", async () => {
    expect(await restoreAddonTables([])).toEqual({ skipped: [], restored: [] });
  });
});
