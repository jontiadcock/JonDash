import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Update channel: "stable" (the `main` branch) or "beta" (the `beta` branch).
 * Stored as one word in `.data/update-channel` — a file, not a DB setting,
 * because the launcher (scripts/update.mjs) reads it before the app boots.
 * Defaults to "stable" when absent/invalid.
 */

export const CHANNELS = ["stable", "beta"] as const;
export type UpdateChannel = (typeof CHANNELS)[number];
export const DEFAULT_CHANNEL: UpdateChannel = "stable";

const CHANNEL_FILE = path.join(process.cwd(), ".data", "update-channel");
const REPO = process.env.UPDATE_REPO ?? "jontiadcock/JonDash";

export function isChannel(v: unknown): v is UpdateChannel {
  return v === "stable" || v === "beta";
}

/** The git branch a channel tracks. */
export function branchForChannel(channel: UpdateChannel): string {
  return channel === "beta" ? "beta" : "main";
}

/** The updates.json URL for a channel (that channel's branch). */
export function manifestUrl(channel: UpdateChannel): string {
  return `https://raw.githubusercontent.com/${REPO}/${branchForChannel(channel)}/updates.json`;
}

/**
 * A documentation file in this repo, on the branch the install actually tracks.
 *
 * The branch matters: someone on beta writing a module is writing against beta's contract, and
 * pointing them at stable's guide would describe an API their build does not have. Derived from
 * the same `REPO` and `branchForChannel` as everything else here so a fork or a renamed branch
 * cannot leave one link behind.
 */
export function docUrl(channel: UpdateChannel, file: string): string {
  return `https://github.com/${REPO}/blob/${branchForChannel(channel)}/docs/${file}`;
}

export function readChannel(): UpdateChannel {
  try {
    const raw = fs.readFileSync(CHANNEL_FILE, "utf8").trim().toLowerCase();
    if (isChannel(raw)) return raw;
  } catch {
    // no file yet
  }
  return DEFAULT_CHANNEL;
}

export function writeChannel(channel: UpdateChannel): void {
  const dir = path.dirname(CHANNEL_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CHANNEL_FILE, channel, "utf8");
}
