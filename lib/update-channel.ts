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
