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

/** Read + normalize the stored config, filling defaults. Never throws. */
export function readNetworkConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(NETWORK_FILE, "utf8"));
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
  } catch {
    // No file yet (or unreadable): behave exactly like today — plain HTTP on 3000.
    return { ...DEFAULTS };
  }
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
