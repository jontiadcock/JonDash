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
const RESTART_SIGNAL = path.join(ROOT, ".restart-and-run"); // in-app "restart server"
const SHUTDOWN_SIGNAL = path.join(ROOT, ".shutdown"); // in-app "shut down server"
const POST_UPDATE = path.join(ROOT, ".data", "post-update");
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
  const healthyTimer = setTimeout(() => {
    if (childAlive && exists(POST_UPDATE)) {
      try {
        fs.rmSync(POST_UPDATE, { force: true });
        appendLog("server", "healthy", "server booted OK — cleared post-update marker");
      } catch {
        /* ignore */
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
      // In-app update requested (server dropped the sentinel and exited).
      if (exists(SENTINEL)) {
        appendLog("server", "update-requested", `code=${code} — handing to launcher`);
        return finish(10);
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
      // In-app shutdown requested: stop for good; the launcher window then closes.
      if (exists(SHUTDOWN_SIGNAL)) {
        try {
          fs.rmSync(SHUTDOWN_SIGNAL, { force: true });
        } catch {
          /* ignore */
        }
        appendLog("server", "shutdown", "shutdown requested via app — stopping");
        return finish(0);
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

// Clear any stale in-app control signals from a previous run so a leftover file
// can't trigger an unexpected restart/shutdown on this boot.
for (const f of [RESTART_SIGNAL, SHUTDOWN_SIGNAL]) {
  try {
    fs.rmSync(f, { force: true });
  } catch {
    /* ignore */
  }
}

appendLog("server", "supervise", "starting server.mjs (supervised)");
runOnce();
