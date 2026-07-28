#!/usr/bin/env node
// JonDash server supervisor (OPS-10 / BUG-10).
//
// Owns the running server: spawns `node server.mjs`, tees its output (redacted)
// to logs/server-YYYY-MM-DD.log so a crash is actually captured, restarts it on an
// unexpected crash (with a crash-loop guard), and reports a bad boot to the
// launcher so it can revert. Exits cleanly when the user stops it (Ctrl+C / window
// close). The launcher (start-dashboard.bat) runs this instead of `npm run start`.
//
// Exit codes tell the launcher what to do next:
//   0   clean stop (user Ctrl+C / window close, in-app shutdown, or exit-on-request)
//   10  in-app update requested (.update-and-restart sentinel present)
//   11  boot-crash loop right after an update  -> launcher should REVERT
//   12  boot-crash loop (not after an update)  -> persistent failure; show help
//   13  module installed/removed (.rebuild-and-restart) -> launcher should REBUILD
//
// Two in-app controls are handled here without a launcher round-trip: a `.restart-and-run`
// signal relaunches the server in place (stay supervising); a `.shutdown` signal stops for
// good (exit 0 -> the launcher window closes). Both are written by lib/server-control.ts.
//
// Plain JS, run directly by Node (never imported). Tunables can be overridden with
// env vars for testing (JONDASH_MIN_UPTIME_MS / _MAX_CRASHES / _RESTART_DELAY_MS).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendLog, redact } from "./log.mjs";

const ROOT = process.env.JONDASH_ROOT
  ? path.resolve(process.env.JONDASH_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SENTINEL = path.join(ROOT, ".update-and-restart");
const REBUILD_SIGNAL = path.join(ROOT, ".rebuild-and-restart"); // module install/uninstall
const RESTART_SIGNAL = path.join(ROOT, ".restart-and-run"); // in-app "restart server"
const SHUTDOWN_SIGNAL = path.join(ROOT, ".shutdown"); // in-app "shut down server"
const POST_UPDATE = path.join(ROOT, ".data", "post-update");
const KEEP_SESSIONS = path.join(ROOT, ".data", "keep-sessions"); // in-app restart / rebuild: keep sessions
const LOG_DIR = path.join(ROOT, "logs");
const SERVER_CMD = process.env.JONDASH_SERVER_CMD || "server.mjs"; // overridable for tests

const MIN_UPTIME_MS = Number(process.env.JONDASH_MIN_UPTIME_MS ?? 20000); // ran this long => healthy
const MAX_RAPID_CRASHES = Number(process.env.JONDASH_MAX_CRASHES ?? 3); // consecutive fast crashes
const RESTART_DELAY_MS = Number(process.env.JONDASH_RESTART_DELAY_MS ?? 2000);

let rapidCrashes = 0;
let shuttingDown = false;
let child = null;
let childAlive = false;
let restartTimer = null;

// STATUS_CONTROL_C_EXIT (0xC000013A): Windows sets this exit code when a process
// is ended by a console control event — Ctrl+C, Ctrl+Break, the window closing,
// logoff/shutdown, or an external kill (e.g. a security tool). It is NOT an
// application crash, so it must be treated as a clean stop, not a restart.
const CONTROL_EXIT = 3221225786;

/** Append server output to a daily server log, redacted, best-effort + durable. */
function writeServerLog(text) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `server-${new Date().toISOString().slice(0, 10)}.log`);
    fs.appendFileSync(file, redact(text));
  } catch {
    /* never let logging break the server */
  }
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function finish(code) {
  process.exitCode = code;
  // Give any in-flight console writes a tick to flush, then end.
  setTimeout(() => process.exit(code), 50);
}

function startServer() {
  writeServerLog(`\n${new Date().toISOString()}  ---- server start ----\n`);
  const c = spawn(process.execPath, [SERVER_CMD], { cwd: ROOT, stdio: ["inherit", "pipe", "pipe"] });
  const tee = (src, dst) =>
    src.on("data", (buf) => {
      dst.write(buf); // live to the console
      writeServerLog(buf.toString()); // captured + redacted
    });
  tee(c.stdout, process.stdout);
  tee(c.stderr, process.stderr);
  c.on("error", (e) => {
    appendLog("server", "spawn-error", String(e?.message ?? e));
  });
  return c;
}

function stopChild(signal) {
  try {
    child?.kill(signal);
  } catch {
    /* already gone */
  }
}

// A stop requested by the user or the OS: shut the child down and exit — never
// restart (restarting would turn a Ctrl+C / window-close / external kill into a
// loop, signing everyone out each time).
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  appendLog("server", "shutdown", reason);
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  stopChild("SIGTERM");
  if (!childAlive) finish(0);
}

for (const sig of ["SIGINT", "SIGBREAK", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => shutdown(`received ${sig}`));
}

function runOnce() {
  const startedAt = Date.now();
  childAlive = true;
  child = startServer();

  // Once the server has run past the healthy threshold, a pending update has
  // proven it boots — clear the post-update marker so a *later* unrelated crash
  // never rolls back a version that actually works. (Previously this only happened
  // on a crash-after-healthy, so the marker lingered on a server that kept running.)
  // The keep-sessions marker (an in-app restart / module rebuild kept everyone signed
  // in) is cleared the same way, so it can't carry sessions into a later ordinary restart.
  const healthyTimer = setTimeout(() => {
    if (!childAlive) return;
    for (const [marker, label] of [
      [POST_UPDATE, "post-update"],
      [KEEP_SESSIONS, "keep-sessions"],
    ]) {
      if (exists(marker)) {
        try {
          fs.rmSync(marker, { force: true });
          appendLog("server", "healthy", `server booted OK — cleared ${label} marker`);
        } catch {
          /* ignore */
        }
      }
    }
  }, MIN_UPTIME_MS);
  healthyTimer.unref?.();

  child.on("exit", (code, signal) => {
    clearTimeout(healthyTimer);
    childAlive = false;
    const uptimeMs = Date.now() - startedAt;

    // In-app control signals — but only when we didn't ourselves ask the child to
    // stop (an OS signal / window close sets shuttingDown; honour that instead).
    if (!shuttingDown) {
      /*
       * SHUTDOWN IS CHECKED FIRST, and it clears everything else (BUG-63).
       *
       * This was last, after the update, rebuild and restart signals — so any one of those
       * present at the same moment beat an explicit "stop", and the server came back up. The
       * owner pressed Shut down, saw "JonDash has been shut down", and watched it restart AND
       * install an update: a stale `.update-and-restart` won the race, so the launcher took the
       * update path instead of stopping.
       *
       * A server that comes back after being told to stop cannot be taken out of service at all,
       * which makes this worse than the unwanted update riding along with it. "Stop" is the one
       * instruction nothing else may override, so it is tested before anything else and the
       * competing signals are removed rather than left to fire on the next boot.
       */
      if (exists(SHUTDOWN_SIGNAL)) {
        for (const f of [SHUTDOWN_SIGNAL, SENTINEL, REBUILD_SIGNAL, RESTART_SIGNAL]) {
          try {
            fs.rmSync(f, { force: true });
          } catch {
            /* ignore */
          }
        }
        appendLog("server", "shutdown", "shutdown requested via app — stopping");
        return finish(0);
      }
      // In-app update requested (server dropped the sentinel and exited).
      if (exists(SENTINEL)) {
        appendLog("server", "update-requested", `code=${code} — handing to launcher`);
        return finish(10);
      }
      // A module was installed/removed: its code has to be compiled in, so hand back to
      // the launcher for a rebuild rather than just respawning the same build.
      if (exists(REBUILD_SIGNAL)) {
        appendLog("server", "rebuild-requested", `code=${code} — module change, handing to launcher`);
        return finish(13);
      }
      // In-app restart requested: relaunch the server in place (no rebuild) and keep
      // supervising — a fast restart with no launcher round-trip.
      if (exists(RESTART_SIGNAL)) {
        try {
          fs.rmSync(RESTART_SIGNAL, { force: true });
        } catch {
          /* ignore */
        }
        rapidCrashes = 0; // an intentional restart is not a crash
        appendLog("server", "restart", "restart requested via app — relaunching server");
        process.stderr.write("\n  Restart requested — relaunching the server…\n");
        restartTimer = setTimeout(() => {
          restartTimer = null;
          runOnce();
        }, RESTART_DELAY_MS);
        return;
      }
    }
    // A clean / external stop — a shutdown we initiated, a signal kill, a Windows
    // console-control termination, or a plain 0 exit. Do NOT restart.
    if (shuttingDown || signal !== null || code === CONTROL_EXIT || code === 0) {
      appendLog("server", "stopped", `clean stop (code=${code} signal=${signal})`);
      return finish(0);
    }

    // A genuine application crash (non-zero, non-control exit).
    if (uptimeMs >= MIN_UPTIME_MS) {
      rapidCrashes = 0; // it ran fine — treat this as a transient crash
      if (exists(POST_UPDATE)) {
        try {
          fs.rmSync(POST_UPDATE, { force: true }); // the update booted OK — it's confirmed good
        } catch {
          /* ignore */
        }
      }
    } else {
      rapidCrashes += 1;
    }
    appendLog(
      "server",
      "crashed",
      `code=${code} signal=${signal} uptime=${Math.round(uptimeMs / 1000)}s rapid=${rapidCrashes} — see logs/server-*.log`,
    );

    if (rapidCrashes >= MAX_RAPID_CRASHES) {
      const afterUpdate = exists(POST_UPDATE);
      appendLog(
        "server",
        "give-up",
        afterUpdate ? "boot-crash loop after update — signalling revert" : "boot-crash loop — aborting",
      );
      process.stderr.write(
        `\n  The server keeps crashing on startup. ${
          afterUpdate ? "Rolling back the last update…" : "Not restarting — see logs\\server-*.log."
        }\n`,
      );
      return finish(afterUpdate ? 11 : 12);
    }

    process.stderr.write(`\n  Server exited unexpectedly (code ${code}) — restarting in ${RESTART_DELAY_MS / 1000}s…\n`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      runOnce();
    }, RESTART_DELAY_MS);
  });
}

/*
 * Clear stale in-app control signals from a previous run, so a leftover file can't trigger an
 * unexpected restart, update or shutdown on this boot.
 *
 * **All four, not just two** (BUG-63). The update and rebuild sentinels were left in place on the
 * reasoning that the launcher deletes them itself — which it does, on the path where it acts on
 * them. On any path where it doesn't (an update that failed, a launch interrupted between the two)
 * the file survives, and every one of these is written by the *running server* for the supervisor
 * that spawned it. A signal from a previous process is stale by definition.
 */
for (const f of [RESTART_SIGNAL, SHUTDOWN_SIGNAL, SENTINEL, REBUILD_SIGNAL]) {
  try {
    fs.rmSync(f, { force: true });
  } catch {
    /* ignore */
  }
}

appendLog("server", "supervise", "starting server.mjs (supervised)");
runOnce();
