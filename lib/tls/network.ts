import "server-only";
import { createSecureContext } from "node:tls";
import fs from "node:fs";
import { z } from "zod";
import {
  readNetworkConfig as readRaw,
  writeNetworkConfig as writeRaw,
  readTlsStatus as readStatus,
} from "./network-config.mjs";
import { loadModeCert, describeCertificate } from "./certs.mjs";

/** What the installed certificate for this mode actually is — issuer, names, expiry (OPS-07). */
/** REFS app/admin/network/cert-panel.tsx */
export type CertSummary = {
  ok: boolean;
  issuer?: string;
  subject?: string;
  altNames?: string[];
  notBefore?: string;
  notAfter?: string;
  daysLeft?: number;
  expired?: boolean;
  notYetValid?: boolean;
  selfSigned?: boolean;
  error?: string;
};

/**
 * Server-only wrapper around the network/TLS config store. The low-level file
 * I/O lives in network-config.mjs (shared with the out-of-Next custom server);
 * this module adds the zod validation + BYO-cert checks used by the admin UI.
 * All callers here are ADMIN-gated.
 */

export type TlsMode = "off" | "letsencrypt" | "selfsigned" | "byo";
/** REFS app/admin/network/cert-panel.tsx · app/admin/network/ui.tsx · lib/tls/network-config.mjs */
export type NetworkConfig = {
  mode: TlsMode;
  httpPort: number;
  httpsPort: number;
  domain: string;
  email: string;
  certPath: string;
  keyPath: string;
  selfSignedDays: number;
};

/**
 * REFS app/admin/network/actions.ts · app/admin/network/page.tsx · lib/tls/network-config.mjs
 *      scripts/print-url.mjs
 * PINS tests/unit/network.test.ts
 */
export function readNetworkConfig(): NetworkConfig {
  return readRaw() as NetworkConfig;
}
/** REFS app/admin/network/page.tsx · lib/tls/network-config.mjs */
export function readTlsStatus() {
  return readStatus() as {
    state: string;
    domain: string;
    issuer: string;
    /** Expiry of the certificate **installed** on disk, written when one is issued or imported. */
    notAfter: string;
    /**
     * Expiry of the certificate the HTTPS listener is ACTUALLY serving. ⚠ Written only by the code
     * that binds the credential, so "is this being served?" is a fact rather than a comparison
     * between two files. Absent until the server has bound one, which correctly reads as
     * "installed, not yet applied".
     * REFS server.mjs › recordServing() — the only writer · app/admin/network/page.tsx — the reader
     */
    servingNotAfter?: string;
    lastRenewal: string;
    lastError: string;
    updatedAt?: string;
  };
}

/**
 * The certificate this install would actually serve, described — or null when there isn't one yet.
 *
 * Reads the file rather than the status record on purpose. `status.json` says what happened the
 * last time the server started; this says what is on disk *now*, which is what matters after
 * generating or importing one and before restarting to apply it. The two disagreeing is exactly the
 * state the page needs to be able to show.
 * REFS app/admin/network/page.tsx
 */
export function describeInstalledCert(cfg: NetworkConfig): CertSummary | null {
  const pair = loadModeCert(cfg);
  if (!pair) return null;
  return describeCertificate(pair.cert) as CertSummary;
}

const portSchema = z.coerce
  .number()
  .int("Port must be a whole number.")
  .min(1, "Port must be 1–65535.")
  .max(65535, "Port must be 1–65535.");

// A DNS hostname (no scheme, no path). Used for the Let's Encrypt domain.
const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*)(\.[a-z0-9](-?[a-z0-9])*)+$/,
    "Enter a bare domain like dash.example.com (no https://, no path).",
  );

const baseSchema = z.object({
  mode: z.enum(["off", "letsencrypt", "selfsigned", "byo"]),
  httpPort: portSchema,
  httpsPort: portSchema,
  domain: z.string().trim().default(""),
  email: z.string().trim().default(""),
  certPath: z.string().trim().default(""),
  keyPath: z.string().trim().default(""),
  selfSignedDays: z.coerce.number().int().min(1).max(3650).default(365),
});

/** Verify a cert/key pair on disk parses and the key matches the cert. */
/** PINS tests/unit/network.test.ts */
export function validateByoCert(
  certPath: string,
  keyPath: string,
): { ok: true } | { ok: false; error: string } {
  let cert: Buffer;
  let key: Buffer;
  try {
    cert = fs.readFileSync(certPath);
  } catch {
    return { ok: false, error: `Can't read the certificate file at: ${certPath}` };
  }
  try {
    key = fs.readFileSync(keyPath);
  } catch {
    return { ok: false, error: `Can't read the private key file at: ${keyPath}` };
  }
  try {
    // Throws if the PEMs are malformed or the key doesn't match the certificate.
    createSecureContext({ cert, key });
    return { ok: true };
  } catch {
    return { ok: false, error: "The certificate and private key don't match or aren't valid PEM." };
  }
}

/**
 * Validate a submitted config (mode-dependent required fields) and, on success,
 * persist it. Returns a friendly error string on failure.
 * REFS app/admin/network/actions.ts
 * PINS tests/unit/network.test.ts
 */
export function parseAndSaveNetworkConfig(input: unknown): { ok: true } | { ok: false; error: string } {
  /*
   * A mode can hide a port field (e.g. "Off" doesn't render an HTTPS port), so it
   * posts empty/absent. Coalesce any missing/blank port from the existing config
   * rather than coercing "" → 0 (which failed min(1) and blocked every Off save,
   * BUG-05), and so a hidden field never wipes a previously-saved port.
   */
  const existing = readNetworkConfig();
  const merged: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  if (merged.httpPort === "" || merged.httpPort == null) merged.httpPort = existing.httpPort;
  if (merged.httpsPort === "" || merged.httpsPort == null) merged.httpsPort = existing.httpsPort;

  const parsed = baseSchema.safeParse(merged);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const cfg = parsed.data;

  if (cfg.mode === "letsencrypt") {
    const d = hostnameSchema.safeParse(cfg.domain);
    if (!d.success) return { ok: false, error: d.error.issues[0]?.message ?? "Invalid domain." };
    cfg.domain = d.data;
    if (cfg.email) {
      const e = z.email("Enter a valid contact email.").safeParse(cfg.email.toLowerCase());
      if (!e.success) return { ok: false, error: e.error.issues[0]?.message ?? "Invalid email." };
      cfg.email = e.data;
    }
  }

  /*
   * **A mode with no certificate yet is allowed to be saved.**
   *
   * It used to be refused: `byo` demanded two readable paths before the form would save at all. But
   * importing a certificate (1.8.0) needs the mode selected first, and generating a self-signed one
   * likewise — so refusing to save leaves the admin in a loop where neither step can be done first.
   * The server already declines to start HTTPS without a usable pair and says so in the status, and
   * the page says so too. Refusing the save only moved the complaint somewhere less useful.
   */
  if (cfg.mode === "byo" && cfg.certPath && cfg.keyPath) {
    const v = validateByoCert(cfg.certPath, cfg.keyPath);
    if (!v.ok) return v;
  }

  writeRaw(cfg);
  return { ok: true };
}

/** PEM in hand (an upload), rather than a path on disk — the 1.8.0 import path. */
/**
 * REFS app/admin/network/actions.ts
 * PINS tests/unit/tls-certs.test.ts
 */
export function validateByoPem(
  cert: string,
  key: string,
): { ok: true } | { ok: false; error: string } {
  if (!/-----BEGIN CERTIFICATE-----/.test(cert)) {
    return { ok: false, error: "That certificate file isn't PEM — it should start with -----BEGIN CERTIFICATE-----." };
  }
  if (!/-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(key)) {
    return { ok: false, error: "That key file isn't PEM — it should start with -----BEGIN PRIVATE KEY-----." };
  }
  try {
    // Throws if the PEMs are malformed or the key doesn't match the certificate.
    createSecureContext({ cert, key });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "The certificate and private key don't match. Check you uploaded the pair that belong together.",
    };
  }
}
