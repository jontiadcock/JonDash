import "server-only";
import fs from "node:fs";
import path from "node:path";
import { isNewer, type ReleaseType } from "@/lib/version";
import { readChannel, manifestUrl, type UpdateChannel } from "@/lib/update-channel";
import { readUpdateFailure, type UpdateFailure } from "@/lib/update-prefs";

const REPO_DIR = process.cwd();
export const RESTART_SENTINEL = path.join(REPO_DIR, ".update-and-restart");

export type ReleaseInfo = {
  version: string;
  type: ReleaseType | string;
  criticality: string;
  summary: string;
};

export type UpdateStatus = {
  supported: boolean; // build supports self-update
  updateAvailable: boolean;
  current: string; // local version (from package.json)
  latest: string | null;
  release: ReleaseInfo | null; // details of the newest release
  channel: UpdateChannel; // which channel this check used
  failure: UpdateFailure | null; // the last update that failed + was rolled back, if any
  reason?: string; // any soft error (e.g. offline)
};

let cache: { at: number; status: UpdateStatus } | null = null;
const CACHE_MS = 3 * 60 * 1000;

/**
 * Drop the cached update check. ⚠ Call it whenever anything changes WHICH release applies —
 * switching channel above all, since the cached status came from the other channel's manifest.
 * Without it the Updates page offers the old channel's release for three minutes and the switch
 * looks like it did nothing (the shape of BUG-35).
 * REFS app/admin/updates/schedule-actions.ts  PINS tests/unit/update-cache-invalidation.test.ts
 */
export function clearUpdateStatusCache(): void {
  cache = null;
}

function localVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The installed app version, from package.json. ⚠ The value every `minAppVersion` check compares
 *  against, so it is not display-only. REFS lib/version.ts › compareVersions() ·
 *  lib/modules/updates.ts · lib/helpers/updates.ts · lib/helpers/install.ts — the gatekeepers */
export function getAppVersion(): string {
  return localVersion();
}

async function fetchManifest(url: string): Promise<{ releases: ReleaseInfo[] } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "JonDash-Updater", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Check whether a newer version exists on GitHub; cached briefly.
 *  REFS lib/update-channel.ts — decides which manifest is read · clearUpdateStatusCache() above
 *       app/admin/updates/page.tsx · app/api/update/status/route.ts · lib/updates/auto-run.ts */
export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
  // ⚠ The failure marker is read fresh every call, never cached, so a dismiss or a new failure
  // shows immediately. REFS lib/update-prefs.ts › readUpdateFailure()
  const failure = readUpdateFailure();
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return { ...cache.status, failure };

  const current = localVersion();
  const channel = readChannel();
  const base: UpdateStatus = {
    supported: true,
    updateAvailable: false,
    current,
    latest: null,
    release: null,
    channel,
    failure,
  };

  const manifest = await fetchManifest(manifestUrl(channel));
  const latest = manifest?.releases?.[0] ?? null;
  let status: UpdateStatus;
  if (!latest) {
    status = { ...base, reason: "Couldn't reach GitHub (offline or unavailable)." };
  } else {
    status = {
      ...base,
      latest: latest.version,
      updateAvailable: isNewer(latest.version, current),
      release: latest,
    };
  }

  cache = { at: Date.now(), status };
  return status;
}

/**
 * Ask the supervised launcher to download, apply and restart: drop the sentinel, then exit so
 * `start-dashboard.bat` runs the updater, rebuilds and relaunches.
 * REFS scripts/update.mjs — what the launcher then runs · app/api/update/apply/route.ts
 *      lib/updates/scheduler.ts — the automatic path  PINS
 *      tests/unit/launcher-no-autoupdate.test.ts
 */
export function requestUpdateRestart(): void {
  fs.writeFileSync(RESTART_SENTINEL, new Date().toISOString(), "utf8");
  cache = null;
  setTimeout(() => process.exit(0), 800);
}
