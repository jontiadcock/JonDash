#!/usr/bin/env node
// JonDash action log — a small, dependency-free logging helper shared by the
// launcher (start-dashboard.bat) and the server (server.mjs).
//
// Goals:
//   * A durable, timestamped record of what the launcher/app did, so a failed
//     startup or a cert-renewal problem can be diagnosed after the fact.
//   * NEVER write secrets. Every "detail" is passed through a redactor first.
//   * Self-maintaining: one file per day, older files pruned automatically.
//
// Usage as a CLI (from the .bat):
//   node scripts/log.mjs <phase> <status> [detail...]
// Usage as a module (from server.mjs):
//   import { appendLog } from "./scripts/log.mjs";
//   appendLog("tls", "renew-failed", err.message);

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, "logs");
const RETENTION_DAYS = 14;

// --- redaction --------------------------------------------------------------
// Defensive scrubbing: launcher phases carry no secrets, but this is the
// guarantee for anything that flows through (e.g. OPS-05 cert paths / errors).
const REDACTIONS = [
  // PEM blocks (private keys, certs) — collapse the whole block.
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[REDACTED PEM]"],
  // ENCRYPTION_KEY=<hex> or similar KEY/SECRET/TOKEN/PASSWORD assignments.
  [/\b([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PWD)[A-Z0-9_]*)\s*[=:]\s*\S+/gi, "$1=[REDACTED]"],
  // Authorization / Bearer headers.
  [/\b(Authorization|Bearer)\b\s*:?\s*\S+/gi, "$1 [REDACTED]"],
  // Bare 64-hex strings (the AES key is 64 hex chars).
  [/\b[0-9a-fA-F]{64}\b/g, "[REDACTED HEX]"],
  // Long base64-ish blobs (opaque tokens) — 40+ chars.
  [/\b[A-Za-z0-9+/=_-]{40,}\b/g, "[REDACTED]"],
];

/** Mask anything secret-looking. Always run before writing to disk. */
export function redact(text) {
  let out = String(text ?? "");
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  // Keep log lines single-line and bounded.
  return out.replace(/[\r\n]+/g, " ").slice(0, 2000);
}

function pruneOldLogs() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(LOG_DIR)) {
      if (!name.startsWith("launcher-") || !name.endsWith(".log")) continue;
      const p = path.join(LOG_DIR, name);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
      } catch {
        /* ignore a single file we can't stat/remove */
      }
    }
  } catch {
    /* logs dir may not exist yet; nothing to prune */
  }
}

/**
 * Append one event line: "<ISO ts>  <PHASE>  <STATUS>  <detail>".
 * Best-effort: logging must never throw into the caller's path.
 */
export function appendLog(phase, status, detail = "") {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const now = new Date();
    const file = path.join(LOG_DIR, `launcher-${now.toISOString().slice(0, 10)}.log`);
    const line =
      `${now.toISOString()}  ${String(phase).toUpperCase().padEnd(8)}  ` +
      `${String(status).padEnd(14)}  ${redact(detail)}`.trimEnd() + "\n";
    fs.appendFileSync(file, line);
    pruneOldLogs();
  } catch {
    /* never let logging break startup */
  }
}

// --- CLI entry point --------------------------------------------------------
// Run only when invoked directly (not when imported).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [phase = "app", status = "info", ...rest] = process.argv.slice(2);
  appendLog(phase, status, rest.join(" "));
}
