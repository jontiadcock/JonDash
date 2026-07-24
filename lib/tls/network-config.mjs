// Canonical network / TLS configuration store.
//
// Plain JS (no deps, no "server-only") on purpose: this module is imported both
// by the out-of-Next custom server (server.mjs, before Next boots) AND — via the
// server-only wrapper lib/tls/network.ts — by the admin UI. Keep it dependency-free.
//
// Config lives in .data/network.json (gitignored, preserved across updates, like
// secrets.json). Cert material lives in .data/tls/ (see acme.mjs).

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
export const NETWORK_FILE = path.join(DATA_DIR, "network.json");
export const TLS_DIR = path.join(DATA_DIR, "tls");
export const STATUS_FILE = path.join(TLS_DIR, "status.json");
export const ACCOUNT_KEY_FILE = path.join(TLS_DIR, "account.key");
export const CERT_FILE = path.join(TLS_DIR, "cert.pem"); // fullchain
export const KEY_FILE = path.join(TLS_DIR, "privkey.pem");

export const MODES = /** @type {const} */ (["off", "letsencrypt", "byo"]);

/** @typedef {{ mode: "off"|"letsencrypt"|"byo", httpPort: number, httpsPort: number, domain: string, email: string, certPath: string, keyPath: string }} NetworkConfig */

/** @type {NetworkConfig} */
export const DEFAULTS = {
  mode: "off",
  httpPort: 3000,
  httpsPort: 443,
  domain: "",
  email: "",
  certPath: "",
  keyPath: "",
};

function coercePort(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

/**
 * Read the config, and say WHY if it couldn't be read (BUG-28).
 *
 * The old behaviour swallowed every failure and returned DEFAULTS, so a file that exists
 * but won't parse was indistinguishable from no file at all: the server came up on plain
 * HTTP port 3000 with no warning anywhere. For an install configured for HTTPS that is a
 * silent downgrade to unencrypted — the one failure mode worth refusing to start over.
 *
 * `error` is set ONLY when the file exists and could not be used. Absent file = no error;
 * defaulting is legitimate there.
 */
export function readNetworkConfigResult() {
  let text;
  try {
    text = fs.readFileSync(NETWORK_FILE, "utf8");
  } catch {
    return { config: { ...DEFAULTS }, error: null }; // no file: defaults are correct
  }

  try {
    // A UTF-8 BOM makes JSON.parse throw. Hand-edit the file in almost any Windows editor
    // and you get one — it is invisible, and the resulting failure never mentions it.
    const raw = JSON.parse(text.replace(/^﻿/, ""));
    if (!raw || typeof raw !== "object") throw new Error("not a JSON object");
    return { config: normalize(raw), error: null };
  } catch (e) {
    return {
      config: { ...DEFAULTS },
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Read + normalize the stored config, filling defaults. Never throws. */
export function readNetworkConfig() {
  return readNetworkConfigResult().config;
}

function normalize(raw) {
  const mode = MODES.includes(raw?.mode) ? raw.mode : DEFAULTS.mode;
  return {
    mode,
    httpPort: coercePort(raw?.httpPort, mode === "off" ? 3000 : 80),
    httpsPort: coercePort(raw?.httpsPort, 443),
    domain: typeof raw?.domain === "string" ? raw.domain.trim() : "",
    email: typeof raw?.email === "string" ? raw.email.trim() : "",
    certPath: typeof raw?.certPath === "string" ? raw.certPath.trim() : "",
    keyPath: typeof raw?.keyPath === "string" ? raw.keyPath.trim() : "",
  };
}

/** Persist config (0600, like secrets.json). Caller is trusted (ADMIN). */
export function writeNetworkConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const mode = MODES.includes(cfg.mode) ? cfg.mode : "off";
  const clean = {
    mode,
    httpPort: coercePort(cfg.httpPort, mode === "off" ? 3000 : 80),
    httpsPort: coercePort(cfg.httpsPort, 443),
    domain: String(cfg.domain ?? "").trim(),
    email: String(cfg.email ?? "").trim(),
    certPath: String(cfg.certPath ?? "").trim(),
    keyPath: String(cfg.keyPath ?? "").trim(),
  };
  fs.writeFileSync(NETWORK_FILE, JSON.stringify(clean, null, 2), { mode: 0o600 });
  return clean;
}

/** Read the TLS/cert status written by the server, or a default idle status. */
export function readTlsStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return { state: "idle", domain: "", issuer: "", notAfter: "", lastRenewal: "", lastError: "" };
  }
}

/** Merge-patch the status file (0600). Best-effort; never throws. */
export function writeTlsStatus(patch) {
  try {
    fs.mkdirSync(TLS_DIR, { recursive: true, mode: 0o700 });
    const current = readTlsStatus();
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  } catch {
    return null;
  }
}
