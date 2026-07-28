import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Update preferences kept as files under `.data` rather than as database settings, because the
 * launcher reads them before the app is running — same pattern as the update channel.
 *
 *  - `.data/auto-update` — "on" | "off" (absent = off). **Whether JonDash itself is included in
 *    scheduled automatic updates**, i.e. the app's own entry in the per-item exclusion list on
 *    Admin → Updates. It is read by the scheduler (`lib/updates/auto-run.ts`).
 *
 *    **It no longer means "the launcher may install at startup"** (owner, 2026-07-28: the
 *    launcher never updates the software automatically). That is what made BUG-61 possible: this
 *    file was the only thing the launcher could read pre-boot, it was driven by the per-item
 *    exclusion rather than by the master switch, and so switching automatic updates *off* left it
 *    saying "on" and the launcher dutifully installed. With nothing acting on it at boot, the
 *    master switch (`updates.autoEnabled`) and this exclusion can no longer disagree about
 *    anything that matters — the scheduler checks both.
 *
 *  - `.data/update-failed` — JSON written by the launcher when an update failed to build/boot and
 *    was rolled back to the previous version. Surfaced as an admin notice; the failed version is
 *    not retried automatically until this is cleared (a manual update or an explicit dismiss).
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const AUTO_UPDATE_FILE = path.join(DATA_DIR, "auto-update");
const FAILURE_FILE = path.join(DATA_DIR, "update-failed");

export function readAutoInstall(): boolean {
  try {
    return fs.readFileSync(AUTO_UPDATE_FILE, "utf8").trim().toLowerCase() === "on";
  } catch {
    return false;
  }
}

export function writeAutoInstall(on: boolean): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTO_UPDATE_FILE, on ? "on" : "off", "utf8");
}

export type UpdateFailure = { failedVersion: string; revertedTo: string; at: string };

export function readUpdateFailure(): UpdateFailure | null {
  try {
    const o = JSON.parse(fs.readFileSync(FAILURE_FILE, "utf8"));
    if (o && typeof o.failedVersion === "string") {
      return {
        failedVersion: o.failedVersion,
        revertedTo: String(o.revertedTo ?? ""),
        at: String(o.at ?? ""),
      };
    }
  } catch {
    /* no marker */
  }
  return null;
}

export function clearUpdateFailure(): void {
  try {
    fs.rmSync(FAILURE_FILE, { force: true });
  } catch {
    /* nothing to clear */
  }
}
