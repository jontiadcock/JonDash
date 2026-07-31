import "server-only";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/config";

/**
 * Launcher preferences — things `start-dashboard.bat` must know BEFORE the app exists. ⚠ Files
 * under `.data/`, never database settings: the launcher runs before Node has opened the database,
 * and `.data/` is preserved across updates so the choice survives one.
 * REFS start-dashboard.bat — the reader · lib/update-prefs.ts — the same pattern
 */

const NO_BROWSER_FILE = () => path.join(dataDir(), "no-browser");

/**
 * Whether the launcher should open a browser on first launch (OPS-06).
 *
 * ⚠ There are TWO routes and only one is here. The launcher also honours `JONDASH_NO_BROWSER`,
 * which is the only thing that helps a headless box — a UI-only switch cannot be set by somebody
 * who cannot see the window it opened. The env var is absent from this file because the app cannot
 * change it and must not pretend to.
 * REFS start-dashboard.bat — reads both · app/admin/server/page.tsx — shows this one
 * PINS tests/unit/launcher-startup.test.ts
 */
export function readOpenBrowser(): boolean {
  return !fs.existsSync(NO_BROWSER_FILE());
}

/** REFS app/admin/server/startup-actions.ts  PINS tests/unit/launcher-startup.test.ts */
export function writeOpenBrowser(open: boolean): void {
  const file = NO_BROWSER_FILE();
  if (open) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Content is irrelevant — the launcher tests for EXISTENCE, all a .bat can do cheaply. The
  // text is for whoever finds the file in `.data/`.
  fs.writeFileSync(file, "Delete this file to let JonDash open a browser on first launch.\n", "utf8");
}
