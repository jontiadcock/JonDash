import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Update preferences the launcher also reads pre-boot (so they're files under
 * `.data`, not DB settings — same pattern as the update channel):
 *  - `.data/auto-update`  — "on" | "off" (absent = off). Whether the launcher
 *    auto-installs an available update at startup. Off by default: JonDash only
 *    notifies, and updates apply solely when the user chooses (the in-app button).
 *  - `.data/update-failed` — JSON written by the launcher when an update failed to
 *    build/boot and was rolled back to the previous version. Surfaced as an admin
 *    notice; the failed version is not auto-retried until this is cleared (a manual
 *    update or an explicit dismiss).
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
