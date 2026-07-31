import "server-only";
import fs from "node:fs";
import path from "node:path";

const REPO_DIR = process.cwd();

/*
 * Signal files the supervisor watches for when the server process exits, at the repo root.
 *   .restart-and-run — relaunch in place, no rebuild; the supervisor stays up.
 *   .shutdown        — stop for good; the supervisor exits and the launcher window closes.
 * REFS scripts/supervise.mjs — the only reader; the names must match on both sides
 */
export const RESTART_SIGNAL = path.join(REPO_DIR, ".restart-and-run");
/** REFS scripts/supervise.mjs — treats this one as a clean stop, not a crash */
export const SHUTDOWN_SIGNAL = path.join(REPO_DIR, ".shutdown");

/*
 * ⚠ When present at the next boot the new process REUSES the session epoch, so everyone stays
 * signed in. Written only by graceful app-initiated restarts, never by shutdown — a
 * shutdown → cold start must still sign everyone out.
 * REFS lib/boot.ts › SESSION_EPOCH — the reader; the supervisor clears it after a healthy boot
 */
const KEEP_SESSIONS_MARKER = path.join(REPO_DIR, ".data", "keep-sessions");

// Give the HTTP response a moment to flush before the process exits.
const EXIT_DELAY_MS = 800;

/**
 * Leave the "keep everyone signed in across the coming restart" marker. ⚠ Best-effort on purpose:
 * an unwritable marker means the next boot advances the epoch and signs out, the safe direction.
 * ⚠ Never call it on shutdown. REFS lib/boot.ts · lib/modules/rebuild.ts — the other caller
 */
export function markKeepSessions(): void {
  try {
    fs.mkdirSync(path.join(REPO_DIR, ".data"), { recursive: true });
    fs.writeFileSync(KEEP_SESSIONS_MARKER, "1", "utf8");
  } catch {
    /* best effort */
  }
}

/**
 * Ask the supervised launcher to restart the server in place: drop the signal, then exit so the
 * supervisor respawns `server.mjs` with no reinstall or rebuild. Safe unsupervised — the process
 * simply exits.
 * REFS app/api/server/restart/route.ts · lib/modules/rebuild.ts · scripts/supervise.mjs
 */
export function requestServerRestart(): void {
  markKeepSessions(); // an intentional restart keeps everyone signed in
  fs.writeFileSync(RESTART_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}

/**
 * Ask the supervised launcher to shut the server down for good. The supervisor treats it as a
 * clean stop and the launcher window closes, so restarting needs someone at the host.
 *
 * ⚠ Never leaves the keep-sessions marker — a shutdown is the one intentional stop that still
 * signs everyone out. REFS app/api/server/shutdown/route.ts · scripts/supervise.mjs
 */
export function requestServerShutdown(): void {
  // ⚠ Clear any marker a recent restart left that the supervisor has not cleared yet, or a
  // shutdown following a restart would keep sessions across the cold start.
  try {
    fs.rmSync(KEEP_SESSIONS_MARKER, { force: true });
  } catch {
    /* best effort */
  }
  fs.writeFileSync(SHUTDOWN_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}
