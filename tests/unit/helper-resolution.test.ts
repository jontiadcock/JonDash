import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { verifyModuleFiles } from "@/lib/modules/verify";
import { pruneUnusedHelpers } from "@/lib/helpers/install";

/**
 * REGRESSION (2026-07-22, found by the module-creator session running a full lifecycle).
 *
 * Both bugs made the entire helper mechanism inert, and both had the same root cause: the
 * install/uninstall actions asked the COMPILED registry (lib/modules/generated.ts) about a
 * module whose files had just changed on disk. That import is fixed at build time, so it
 * can neither contain a module downloaded seconds ago nor forget one being removed right
 * now. Neither failed loudly — helpers simply never installed, and never got pruned.
 */

const HELPERS_DIR = path.join(process.cwd(), "helpers");
const TEST_HELPER = path.join(HELPERS_DIR, "prunetest");

afterEach(() => {
  fs.rmSync(TEST_HELPER, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("declared helpers survive the install path", () => {
  it("verifyModuleFiles reports them, so the installer doesn't need the registry", () => {
    const src = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.5.0",
  permissions: [], helpers: ["scheduler"],
};
export default mod;`;
    const res = verifyModuleFiles("demo", [{ path: "module.ts", bytes: 200, text: src }]);
    expect(res.ok).toBe(true);
    // This is what the install action must use — the module isn't in the registry yet.
    expect(res.declaredHelpers).toEqual(["scheduler"]);
  });

  it("reports an empty list when a module declares none", () => {
    const src = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.5.0",
  permissions: [],
};
export default mod;`;
    expect(verifyModuleFiles("demo", [{ path: "module.ts", bytes: 200, text: src }]).declaredHelpers).toEqual([]);
  });
});

describe("pruning excludes modules being removed", () => {
  function layHelper() {
    fs.mkdirSync(TEST_HELPER, { recursive: true });
    fs.writeFileSync(path.join(TEST_HELPER, "helper.ts"), "export default {};", "utf8");
  }

  it("removes a helper whose only dependent is the module being uninstalled", async () => {
    layHelper();
    // The registry still contains the module — that's the whole point of the bug.
    const registry = await import("@/lib/modules/registry");
    vi.spyOn(registry, "getAllModules").mockReturnValue([
      { id: "dep", name: "Dep", description: "", version: "1.0.0", minAppVersion: "1.5.0", permissions: [], helpers: ["prunetest"] },
    ]);

    // Told what's going away, it must not count that module as its own dependent.
    expect(pruneUnusedHelpers(["dep"])).toEqual(["prunetest"]);
    expect(fs.existsSync(TEST_HELPER)).toBe(false);
  });

  it("keeps a helper another module still needs", async () => {
    layHelper();
    const registry = await import("@/lib/modules/registry");
    vi.spyOn(registry, "getAllModules").mockReturnValue([
      { id: "dep", name: "Dep", description: "", version: "1.0.0", minAppVersion: "1.5.0", permissions: [], helpers: ["prunetest"] },
      { id: "other", name: "Other", description: "", version: "1.0.0", minAppVersion: "1.5.0", permissions: [], helpers: ["prunetest"] },
    ]);

    expect(pruneUnusedHelpers(["dep"])).toEqual([]);
    expect(fs.existsSync(TEST_HELPER)).toBe(true);
  });
});
