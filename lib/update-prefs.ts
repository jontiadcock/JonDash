import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Update preferences kept as files under `.data/`, not database settings, because the launcher
 * reads them before the app is running — the same pattern as the update channel.
 *
 * `.data/auto-update` ("on"|"off", absent = off) is whether JonDash ITSELF is included in scheduled
 * automatic updates — the app's own entry in the per-item exclusion list.
 * ⚠ It does NOT mean "the launcher may install at startup". That reading caused BUG-61: it was the
 * only file the launcher could read pre-boot and it tracked the per-item exclusion, so turning
 * automatic updates off left it saying "on" and the launcher installed anyway.
 *
 * `.data/update-failed` is JSON the launcher writes after a failed update was rolled back. The
 * failed version is not retried until it is cleared.
 * REFS lib/updates/auto-run.ts — reads both · scripts/update.mjs · start-dashboard.bat
 * PINS tests/unit/launcher-no-autoupdate.test.ts
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const AUTO_UPDATE_FILE = path.join(DATA_DIR, "auto-update");
const FAILURE_FILE = path.join(DATA_DIR, "update-failed");

/** REFS lib/updates/auto-run.ts — the only thing that acts on it · app/admin/updates/page.tsx
 *  PINS tests/unit/launcher-no-autoupdate.test.ts */
export function readAutoInstall(): boolean {
  try {
    return fs.readFileSync(AUTO_UPDATE_FILE, "utf8").trim().toLowerCase() === "on";
  } catch {
    return false;
  }
}

/** REFS app/admin/settings/actions.ts · app/admin/updates/schedule-actions.ts */
export function writeAutoInstall(on: boolean): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTO_UPDATE_FILE, on ? "on" : "off", "utf8");
}

/** ⚠ Written by the LAUNCHER, so this shape is a cross-process contract.
 *  REFS scripts/update.mjs · app/admin/update-banner.tsx · app/admin/settings/updates-panel.tsx */
export type UpdateFailure = { failedVersion: string; revertedTo: string; at: string };

/** REFS app/admin/update-banner.tsx — the notice · lib/update.ts › getUpdateStatus() ·
 *       lib/updates/auto-run.ts  PINS tests/unit/launcher-no-autoupdate.test.ts */
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

/** ⚠ Clearing this lets the failed version be offered again — it is the dismiss, not a fix.
 *  REFS app/admin/settings/actions.ts · app/api/update/apply/route.ts */
export function clearUpdateFailure(): void {
  try {
    fs.rmSync(FAILURE_FILE, { force: true });
  } catch {
    /* nothing to clear */
  }
}
