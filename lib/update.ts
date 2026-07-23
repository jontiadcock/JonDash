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
 * Drop the cached update check.
 *
 * Must be called whenever something changes WHICH release applies — switching channel is
 * the one that matters, since the cached status was read from the other channel's manifest.
 * Without it the Updates page keeps offering the old channel's release for up to three
 * minutes and the channel switch looks like it did nothing (the same shape as BUG-35).
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

/** The installed app version (from package.json), for display. */
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

/** Check whether a newer version exists on GitHub. Cached briefly. */
export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
  // The rollback/failure marker is read fresh every call (not cached) so a dismiss
  // or a fresh failure reflects immediately.
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
 * Request the supervised launcher to download + apply the update and restart.
 * Drops a sentinel and exits shortly after responding; start-dashboard.bat sees
 * the sentinel, runs the updater script (public download + extract), rebuilds and
 * relaunches.
 */
export function requestUpdateRestart(): void {
  fs.writeFileSync(RESTART_SENTINEL, new Date().toISOString(), "utf8");
  cache = null;
  setTimeout(() => process.exit(0), 800);
}
