import "server-only";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const execFile = promisify(execFileCb);
const REPO_DIR = process.cwd();
export const RESTART_SENTINEL = path.join(REPO_DIR, ".update-and-restart");

export type UpdateStatus = {
  gitRepo: boolean; // is this a git clone (auto-update capable)?
  updateAvailable: boolean;
  behind: number; // how many commits behind origin
  current: string | null;
};

let cache: { at: number; status: UpdateStatus } | null = null;
const CACHE_MS = 3 * 60 * 1000;

async function git(args: string[], timeoutMs = 8000): Promise<string> {
  const { stdout } = await execFile("git", args, {
    cwd: REPO_DIR,
    timeout: timeoutMs,
    windowsHide: true,
  });
  return stdout.trim();
}

/** Check whether a newer version exists on GitHub. Cached briefly. */
export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;

  let status: UpdateStatus = { gitRepo: false, updateAvailable: false, behind: 0, current: null };
  try {
    await git(["rev-parse", "--is-inside-work-tree"], 3000);
    // Refresh remote state; tolerate offline / auth issues.
    try {
      await git(["fetch", "--quiet", "origin"], 8000);
    } catch {
      /* offline or no credentials — fall back to last-known remote */
    }
    const local = await git(["rev-parse", "HEAD"], 3000);
    let behind = 0;
    try {
      // Compare explicitly against origin/main (robust even without branch tracking).
      behind = parseInt(await git(["rev-list", "--count", "HEAD..origin/main"], 3000), 10) || 0;
    } catch {
      /* origin/main not available */
    }
    status = {
      gitRepo: true,
      updateAvailable: behind > 0,
      behind,
      current: local.slice(0, 7),
    };
  } catch {
    status = { gitRepo: false, updateAvailable: false, behind: 0, current: null };
  }

  cache = { at: Date.now(), status };
  return status;
}

/**
 * Request the supervised launcher to pull the update and restart. We drop a
 * sentinel file and exit shortly after responding; start-dashboard.bat sees the
 * sentinel, runs `git pull` + rebuild, and relaunches.
 */
export function requestUpdateRestart(): void {
  fs.writeFileSync(RESTART_SENTINEL, new Date().toISOString(), "utf8");
  cache = null;
  // Let the HTTP response flush before the process exits.
  setTimeout(() => process.exit(0), 800);
}
