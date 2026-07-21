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
//   0   clean stop (user Ctrl+C / window close) or the server exited on request
//   10  in-app update requested (.update-and-restart sentinel present)
//   11  boot-crash loop right after an update  -> launcher should REVERT
//   12  boot-crash loop (not after an update)  -> persistent failure; show help
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
const POST_UPDATE = path.join(ROOT, ".data", "post-update");
const LOG_DIR = path.join(ROOT, "logs");
const SERVER_CMD = process.env.JONDASH_SERVER_CMD || "server.mjs"; // overridable for tests

const MIN_UPTIME_MS = Number(process.env.JONDASH_MIN_UPTIME_MS ?? 20000); // ran this long => healthy
const MAX_RAPID_CRASHES = Number(process.env.JONDASH_MAX_CRASHES ?? 3); // consecutive fast crashes
const RESTART_DELAY_MS = Number(process.env.JONDASH_RESTART_DELAY_MS ?? 2000);

let rapidCrashes = 0;
let shuttingDown = false;
let child = null;

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

// User-initiated stop: don't restart. (Closing the console kills the tree anyway;
// Ctrl+C / Ctrl+Break arrive as these signals.)
for (const sig of ["SIGINT", "SIGBREAK", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    shuttingDown = true;
    appendLog("server", "shutdown", `received ${sig}`);
    stopChild(sig === "SIGINT" ? "SIGINT" : "SIGTERM");
  });
}

function runOnce() {
  const startedAt = Date.now();
  child = startServer();

  child.on("exit", (code, signal) => {
    const uptimeMs = Date.now() - startedAt;

    // In-app update requested (server dropped the sentinel and exited).
    if (exists(SENTINEL)) {
      appendLog("server", "update-requested", `code=${code} — handing to launcher`);
      return finish(10);
    }
    // A stop we asked for.
    if (shuttingDown) {
      appendLog("server", "stopped", `clean shutdown (code=${code} signal=${signal})`);
      return finish(0);
    }

    // Unexpected exit.
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

    process.stderr.write(`\n  Server exited unexpectedly — restarting in ${RESTART_DELAY_MS / 1000}s…\n`);
    setTimeout(runOnce, RESTART_DELAY_MS);
  });
}

appendLog("server", "supervise", "starting server.mjs (supervised)");
runOnce();
