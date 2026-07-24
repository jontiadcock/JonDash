import "server-only";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Rebuild-on-module-change (MOD-01 Phase 2, chunk B).
 *
 * A module's code is compiled into the Next build, so installing or removing one only
 * takes effect after a rebuild. The app drops a `.rebuild-and-restart` sentinel and
 * exits; the supervisor returns exit code 13, and the launcher clears the built-version
 * marker (forcing its normal build path) and relaunches.
 *
 * Safety: `.data/module-installing` names the module that triggered the rebuild. If the
 * build then fails, the launcher runs `scripts/module-recover.mjs`, which removes that
 * module and rebuilds clean — so a broken module can't leave JonDash unbootable. The
 * existing snapshot rollback remains the backstop underneath that.
 */

const ROOT = process.cwd();
export const REBUILD_SIGNAL = path.join(ROOT, ".rebuild-and-restart");
const DATA_DIR = path.join(ROOT, ".data");
export const INSTALLING_MARKER = path.join(DATA_DIR, "module-installing");
export const FAILED_MARKER = path.join(DATA_DIR, "module-failed");

const EXIT_DELAY_MS = 800;

/** Regenerate lib/modules/generated.ts so the next build sees what's on disk. */
export function regenerateRegistry(): void {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "gen-module-registry.mjs")], {
    cwd: ROOT,
    stdio: "ignore",
    timeout: 30_000,
  });
}

/**
 * Note which modules are being installed, so the launcher knows what to remove if the
 * resulting build fails. Takes a LIST because modules can be installed in a batch: when
 * a batch build fails there's no way to tell which member broke it, so all of them are
 * rolled back rather than guessing. Cleared once a build succeeds.
 */
export function markModuleInstalling(moduleIds: string[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INSTALLING_MARKER, moduleIds.join("\n"), "utf8");
}

/**
 * Clear the "a module rebuild is in flight" marker (BUG-36). Called when the app boots
 * successfully — reaching a running server means the build the marker was guarding is fine,
 * so the install is complete. Nothing cleared it on success before, so it lingered forever
 * naming a healthy module, and the next *unrelated* build failure handed recovery that stale
 * name and deleted a module that had nothing to do with the failure. The launcher clears it
 * too, on a good build; this is the cross-platform backstop and the one a test can drive.
 * (`scripts/module-recover.mjs` still clears it on a FAILED build, then removes the module.)
 */
export function clearModuleInstalling(): void {
  fs.rmSync(INSTALLING_MARKER, { force: true });
}

/** Modules the launcher had to remove because they broke the build (for the admin UI). */
export function readFailedModule(): { id: string; at: string } | null {
  try {
    const raw = fs.readFileSync(FAILED_MARKER, "utf8").trim();
    const [id, at] = raw.split("\n");
    return id ? { id, at: at ?? "" } : null;
  } catch {
    return null;
  }
}

export function clearFailedModule(): void {
  fs.rmSync(FAILED_MARKER, { force: true });
}

/**
 * Ask the launcher to rebuild and restart. Mirrors requestServerRestart: drop the
 * sentinel, then exit shortly after so the response can flush. No-op safe when running
 * unsupervised (the process simply exits).
 */
export function requestRebuildAndRestart(): void {
  fs.writeFileSync(REBUILD_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}
