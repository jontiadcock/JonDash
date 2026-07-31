import "server-only";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { markKeepSessions } from "@/lib/server-control";

/*
 * Rebuild-on-module-change. A module compiles into the Next build, so installing or removing one
 * only takes effect after a rebuild: the app drops a sentinel and exits, the supervisor returns 13,
 * the launcher clears the built-version marker and relaunches.
 *
 * ⚠ **The installing marker is the safety net.** If the build then fails, the launcher removes the
 *   named module and rebuilds clean, so a broken module cannot leave JonDash unbootable.
 * REFS scripts/supervise.mjs — reads the sentinel · scripts/module-recover.mjs — the failure path
 *      start-dashboard.bat — clears the built-version marker
 * PINS tests/unit/module-install-marker.test.ts
 */

const ROOT = process.cwd();
/** REFS scripts/supervise.mjs — the only reader; exit code 13 is the contract. */
export const REBUILD_SIGNAL = path.join(ROOT, ".rebuild-and-restart");
const DATA_DIR = path.join(ROOT, ".data");
/** REFS scripts/module-recover.mjs — reads this file to know what to remove. */
export const INSTALLING_MARKER = path.join(DATA_DIR, "module-installing");
export const FAILED_MARKER = path.join(DATA_DIR, "module-failed");

const EXIT_DELAY_MS = 800;

/** Regenerate lib/modules/generated.ts so the next build sees what's on disk. */
/**
 * REFS scripts/gen-module-registry.mjs — what this runs · app/admin/modules/actions.ts and
 *      app/admin/updates/*-actions.ts — every install, update and removal path
 */
export function regenerateRegistry(): void {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "gen-module-registry.mjs")], {
    cwd: ROOT,
    stdio: "ignore",
    timeout: 30_000,
  });
}

/**
 * Name the modules being installed, so the launcher knows what to remove if the build fails. ⚠ A
 * LIST because installs batch: when a batch build fails there is no way to tell which member broke
 * it, so all are rolled back rather than guessed at.
 * REFS scripts/module-recover.mjs — reads it on a failed build
 */
export function markModuleInstalling(moduleIds: string[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INSTALLING_MARKER, moduleIds.join("\n"), "utf8");
}

/**
 * Clear the in-flight marker on a successful boot (BUG-36) — reaching a running server means the
 * build it guarded is fine.
 *
 * ⚠ Nothing cleared it on success before, so it lingered naming a healthy module and the next
 *   *unrelated* build failure deleted an innocent one. The launcher clears it too; this is the
 *   cross-platform backstop and the one a test can drive.
 * PINS tests/unit/module-install-marker.test.ts
 */
export function clearModuleInstalling(): void {
  fs.rmSync(INSTALLING_MARKER, { force: true });
}

/** Modules the launcher had to remove because they broke the build (for the admin UI). */
/** REFS app/admin/modules/page.tsx — renders the "a module was removed" notice from this. */
export function readFailedModule(): { id: string; at: string } | null {
  try {
    const raw = fs.readFileSync(FAILED_MARKER, "utf8").trim();
    const [id, at] = raw.split("\n");
    return id ? { id, at: at ?? "" } : null;
  } catch {
    return null;
  }
}

/** REFS app/admin/modules/actions.ts › dismissFailedModuleAction(). */
export function clearFailedModule(): void {
  fs.rmSync(FAILED_MARKER, { force: true });
}

/**
 * Drop the sentinel, then exit shortly after so the response can flush. Safe unsupervised — the
 * process simply exits.
 * REFS lib/server-control.ts › requestServerRestart() — the same shape for an app restart
 *      lib/updates/scheduler.ts · app/admin/updates/*-actions.ts — the callers
 */
export function requestRebuildAndRestart(): void {
  markKeepSessions(); // a module rebuild is an intentional restart — keep everyone signed in
  fs.writeFileSync(REBUILD_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}
