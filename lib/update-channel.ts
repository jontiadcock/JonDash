import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Update channel: "stable" (`main`) or "beta" (`beta`). ⚠ Stored as one word in a FILE, not a
 * database setting, because the launcher reads it before the app boots. Absent or invalid reads as
 * stable. REFS scripts/update.mjs — the pre-boot reader · lib/update.ts — the in-app reader
 * PINS tests/unit/update-channel.test.ts
 */

/** ⚠ Every value here needs a real branch on the repo below, and an `updates.json` on it. */
export const CHANNELS = ["stable", "beta"] as const;
/** REFS lib/update.ts — the type flows through every function below into the manifest URL */
export type UpdateChannel = (typeof CHANNELS)[number];
/** ⚠ Stable, deliberately: an install with no channel file must never track beta.
 *  PINS tests/unit/update-channel.test.ts */
export const DEFAULT_CHANNEL: UpdateChannel = "stable";

const CHANNEL_FILE = path.join(process.cwd(), ".data", "update-channel");
const REPO = process.env.UPDATE_REPO ?? "jontiadcock/JonDash";

/** REFS app/admin/settings/actions.ts · app/admin/updates/schedule-actions.ts — validate input */
export function isChannel(v: unknown): v is UpdateChannel {
  return v === "stable" || v === "beta";
}

/** The git branch a channel tracks. ⚠ Add-on sources use the same mapping, so a change here moves
 *  modules too. REFS lib/modules/sources.ts  PINS tests/unit/update-channel.test.ts */
export function branchForChannel(channel: UpdateChannel): string {
  return channel === "beta" ? "beta" : "main";
}

/** The updates.json URL for a channel. REFS lib/update.ts › getUpdateStatus() — the only reader;
 *  a cached status belongs to ONE channel, so switching must clear it */
export function manifestUrl(channel: UpdateChannel): string {
  return `https://raw.githubusercontent.com/${REPO}/${branchForChannel(channel)}/updates.json`;
}

/**
 * A documentation file in this repo, on the branch the install actually tracks. ⚠ The branch
 * matters: someone on beta writing a module is writing against beta's contract, and stable's guide
 * describes an API their build does not have.
 * REFS app/admin/modules/page.tsx — the "authoring guide" link
 */
export function docUrl(channel: UpdateChannel, file: string): string {
  return `https://github.com/${REPO}/blob/${branchForChannel(channel)}/docs/${file}`;
}

/** REFS lib/update.ts · app/admin/updates/page.tsx · app/admin/modules/page.tsx ·
 *       app/admin/modules/actions.ts  PINS tests/unit/update-channel.test.ts */
export function readChannel(): UpdateChannel {
  try {
    const raw = fs.readFileSync(CHANNEL_FILE, "utf8").trim().toLowerCase();
    if (isChannel(raw)) return raw;
  } catch {
    // no file yet
  }
  return DEFAULT_CHANNEL;
}

/** ⚠ Both callers must also clear the update-status cache — a cached status was read from the
 *  OTHER channel's manifest. REFS lib/update.ts › clearUpdateStatusCache()
 *       app/admin/settings/actions.ts · app/admin/updates/schedule-actions.ts */
export function writeChannel(channel: UpdateChannel): void {
  const dir = path.dirname(CHANNEL_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CHANNEL_FILE, channel, "utf8");
}
