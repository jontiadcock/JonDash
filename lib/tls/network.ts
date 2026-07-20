import "server-only";
import { createSecureContext } from "node:tls";
import fs from "node:fs";
import { z } from "zod";
import {
  readNetworkConfig as readRaw,
  writeNetworkConfig as writeRaw,
  readTlsStatus as readStatus,
} from "./network-config.mjs";

/**
 * Server-only wrapper around the network/TLS config store. The low-level file
 * I/O lives in network-config.mjs (shared with the out-of-Next custom server);
 * this module adds the zod validation + BYO-cert checks used by the admin UI.
 * All callers here are ADMIN-gated.
 */

export type TlsMode = "off" | "letsencrypt" | "byo";
export type NetworkConfig = {
  mode: TlsMode;
  httpPort: number;
  httpsPort: number;
  domain: string;
  email: string;
  certPath: string;
  keyPath: string;
};

export function readNetworkConfig(): NetworkConfig {
  return readRaw() as NetworkConfig;
}
export function readTlsStatus() {
  return readStatus() as {
    state: string;
    domain: string;
    issuer: string;
    notAfter: string;
    lastRenewal: string;
    lastError: string;
    updatedAt?: string;
  };
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
  mode: z.enum(["off", "letsencrypt", "byo"]),
  httpPort: portSchema,
  httpsPort: portSchema,
  domain: z.string().trim().default(""),
  email: z.string().trim().default(""),
  certPath: z.string().trim().default(""),
  keyPath: z.string().trim().default(""),
});

/** Verify a cert/key pair on disk parses and the key matches the cert. */
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
 */
export function parseAndSaveNetworkConfig(input: unknown): { ok: true } | { ok: false; error: string } {
  const parsed = baseSchema.safeParse(input);
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

  if (cfg.mode === "byo") {
    if (!cfg.certPath || !cfg.keyPath)
      return { ok: false, error: "Provide both a certificate and a private key file path." };
    const v = validateByoCert(cfg.certPath, cfg.keyPath);
    if (!v.ok) return v;
  }

  writeRaw(cfg);
  return { ok: true };
}
