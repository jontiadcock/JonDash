import "server-only";
import fs from "node:fs";
import path from "node:path";

const REPO_DIR = process.cwd();

// Signal files the supervisor (scripts/supervise.mjs) watches for when the server
// process exits. They live at the repo root next to `.update-and-restart`.
//   .restart-and-run — relaunch the server in place (no rebuild); supervisor stays up.
//   .shutdown        — stop for good; the supervisor exits and the launcher window closes.
export const RESTART_SIGNAL = path.join(REPO_DIR, ".restart-and-run");
export const SHUTDOWN_SIGNAL = path.join(REPO_DIR, ".shutdown");

// Marker read by lib/boot at the next boot: when present, the new process REUSES the
// session epoch so everyone stays signed in across this restart. Written only by graceful,
// app-initiated restarts (in-app restart, module rebuild) — never by shutdown, so a
// shutdown → cold start still signs everyone out. boot consumes it (single-use).
const KEEP_SESSIONS_MARKER = path.join(REPO_DIR, ".data", "keep-sessions");

// Give the HTTP response a moment to flush before the process exits.
const EXIT_DELAY_MS = 800;

/**
 * Leave the "keep everyone signed in across the coming restart" marker. Best-effort: if it
 * can't be written, the next boot just advances the epoch and signs out — the safe direction.
 * Deliberately NOT called on shutdown.
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
 * Ask the supervised launcher to restart the server in place. Drops the restart
 * signal and exits shortly after; the supervisor sees the signal on child exit and
 * respawns `server.mjs` (fast — no reinstall/rebuild). No-op safe if unsupervised
 * (the process just exits and the window closes).
 */
export function requestServerRestart(): void {
  markKeepSessions(); // an intentional restart keeps everyone signed in
  fs.writeFileSync(RESTART_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}

/**
 * Ask the supervised launcher to shut the server down for good. Drops the shutdown
 * signal and exits; the supervisor treats it as a clean stop (no restart) and the
 * launcher window closes. Restarting then requires running the launcher on the host.
 *
 * Deliberately does NOT leave the keep-sessions marker: a shutdown is the one intentional
 * stop that still signs everyone out, so the next cold start requires a fresh sign-in.
 */
export function requestServerShutdown(): void {
  // Clear any keep-sessions marker a recent restart may have left but the supervisor hasn't
  // cleared yet, so a shutdown always signs out on the next cold start — never keeps sessions.
  try {
    fs.rmSync(KEEP_SESSIONS_MARKER, { force: true });
  } catch {
    /* best effort */
  }
  fs.writeFileSync(SHUTDOWN_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}
