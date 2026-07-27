import "server-only";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/config";

/**
 * Launcher preferences — things `start-dashboard.bat` must know BEFORE the app exists.
 *
 * They live as files under `.data/` rather than as database settings for the same reason the
 * update channel does: the launcher runs before Node has loaded the app, let alone opened the
 * database, so a setting it has to read cannot live there. `.data/` is also preserved across
 * updates, so a choice survives.
 */

const NO_BROWSER_FILE = () => path.join(dataDir(), "no-browser");

/**
 * Whether the launcher should open a browser on first launch (OPS-06).
 *
 * **Two routes, deliberately, because they serve different moments.** This file is the one an
 * admin sets from inside the app — "I'm set up now, stop doing this" — and it is what the
 * toggle writes. The launcher ALSO honours the `JONDASH_NO_BROWSER` environment variable,
 * which is the only thing that can help a headless or unattended box: a UI-only switch cannot
 * be set by somebody who can't see the window it opened. The env var is not represented here
 * because the app cannot change it and should not pretend to.
 */
export function readOpenBrowser(): boolean {
  return !fs.existsSync(NO_BROWSER_FILE());
}

export function writeOpenBrowser(open: boolean): void {
  const file = NO_BROWSER_FILE();
  if (open) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Content is irrelevant — the launcher tests for existence, which is all a .bat can do
  // cheaply. Write something explanatory anyway, for whoever finds it in `.data/`.
  fs.writeFileSync(file, "Delete this file to let JonDash open a browser on first launch.\n", "utf8");
}
