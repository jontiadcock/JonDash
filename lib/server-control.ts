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

// Give the HTTP response a moment to flush before the process exits.
const EXIT_DELAY_MS = 800;

/**
 * Ask the supervised launcher to restart the server in place. Drops the restart
 * signal and exits shortly after; the supervisor sees the signal on child exit and
 * respawns `server.mjs` (fast — no reinstall/rebuild). No-op safe if unsupervised
 * (the process just exits and the window closes).
 */
export function requestServerRestart(): void {
  fs.writeFileSync(RESTART_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}

/**
 * Ask the supervised launcher to shut the server down for good. Drops the shutdown
 * signal and exits; the supervisor treats it as a clean stop (no restart) and the
 * launcher window closes. Restarting then requires running the launcher on the host.
 */
export function requestServerShutdown(): void {
  fs.writeFileSync(SHUTDOWN_SIGNAL, new Date().toISOString(), "utf8");
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
}
