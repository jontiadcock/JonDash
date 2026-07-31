/*
 * Certificate generation and inspection.
 *
 * Plain JS with no "server-only", like network-config.mjs: server.mjs imports this from outside the
 * Next build to load whichever cert the configured mode calls for, and the admin UI imports it
 * through lib/tls/network.ts to generate and describe one.
 */

import fs from "node:fs";
import os from "node:os";
import { webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";
import acme from "acme-client";
import { TLS_DIR, CERT_FILE, KEY_FILE } from "./network-config.mjs";
import path from "node:path";

x509.cryptoProvider.set(webcrypto);

/** Self-signed material, kept apart from the ACME pair so switching modes never destroys either. */
/** REFS app/admin/network/actions.ts */
export const SELF_CERT_FILE = path.join(TLS_DIR, "selfsigned-cert.pem");
/** REFS app/admin/network/actions.ts */
export const SELF_KEY_FILE = path.join(TLS_DIR, "selfsigned-key.pem");

/** An imported bring-your-own pair, copied in rather than referenced where it happens to live. */
/** REFS app/admin/network/actions.ts */
export const BYO_CERT_FILE = path.join(TLS_DIR, "byo-cert.pem");
/** REFS app/admin/network/actions.ts */
export const BYO_KEY_FILE = path.join(TLS_DIR, "byo-key.pem");

/**
 * How long a self-signed certificate lasts (owner decision D3).
 *
 * Offered as a fixed list rather than a number box because the trade-off is not obvious: a short
 * life is safer if the key leaks and means re-trusting it in every browser that often, and nothing
 * renews it for you. The labels say what each one costs.
 * PINS tests/unit/tls-certs.test.ts
 */
export const VALIDITY_CHOICES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 1095, label: "3 years" },
  { days: 2555, label: "7 years" },
];

export const DEFAULT_VALIDITY_DAYS = 365;

function pemBlock(label, der) {
  const b64 = Buffer.from(der).toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

/**
 * Every name this machine might be reached by.
 *
 * **A self-hosted dashboard is reached by LAN IP far more often than by name**, and a certificate
 * without that address in its SANs produces a name-mismatch warning — which looks exactly like the
 * warning a self-signed certificate already produces for being untrusted, so the user fixes the
 * wrong problem. Enumerating the interfaces costs nothing and removes a whole class of "I trusted
 * it and it still complains".
 * PINS tests/unit/tls-certs.test.ts
 */
export function localNames(domain = "") {
  const dns = new Set(["localhost"]);
  const ips = new Set(["127.0.0.1", "::1"]);
  if (domain) dns.add(domain.trim().toLowerCase());
  try {
    dns.add(os.hostname().toLowerCase());
  } catch {
    /* hostname is best-effort */
  }
  try {
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs ?? []) {
        if (!a.internal && (a.family === "IPv4" || a.family === 4)) ips.add(a.address);
      }
    }
  } catch {
    /* interface enumeration is best-effort */
  }
  return { dns: [...dns].filter(Boolean), ips: [...ips] };
}

/**
 * Generate a self-signed certificate and its key, as PEM.
 *
 * ⚠ NOT a CA certificate — `BasicConstraints(false)`, serverAuth only. One claiming to be a CA
 * could, once trusted, vouch for any other site. Do not "fix" the limitation below by making it
 * one; a local CA was declined (CORE-19), so the limit is permanent.
 * ⚠ Known consequence: Android only accepts a real CA as a trust anchor, so this never validates
 * there — no secure context, and no install prompt over LAN IP. Use Let's Encrypt or a tunnel.
 * REFS lib/tls/acme.mjs — the trusted path · app/manifest.ts — the prompt this blocks
 * REFS app/admin/network/actions.ts
 * PINS tests/unit/tls-certs.test.ts
 */
export async function generateSelfSigned({ domain = "", days = DEFAULT_VALIDITY_DAYS } = {}) {
  const alg = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048,
  };
  const keys = await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
  const { dns, ips } = localNames(domain);
  const commonName = domain || dns[0] || "localhost";
  const now = new Date();
  const notAfter = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    // 16 random bytes, per RFC 5280's "positive integer, ≤ 20 octets".
    serialNumber: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("hex"),
    name: `CN=${commonName}`,
    notBefore: new Date(now.getTime() - 60 * 1000), // a minute of slack for clock skew
    notAfter,
    keys,
    signingAlgorithm: alg,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
        true,
      ),
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1"], true), // serverAuth
      new x509.SubjectAlternativeNameExtension([
        ...dns.map((value) => ({ type: "dns", value })),
        ...ips.map((value) => ({ type: "ip", value })),
      ]),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });

  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", keys.privateKey);
  return {
    cert: Buffer.from(cert.toString("pem")),
    key: Buffer.from(pemBlock("PRIVATE KEY", pkcs8)),
    names: [...dns, ...ips],
    notAfter,
  };
}

/** Write a generated or imported pair at 0600, the same treatment the ACME key already gets. */
/** REFS app/admin/network/actions.ts */
export function writePair(certFile, keyFile, cert, key) {
  fs.mkdirSync(TLS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(certFile, cert, { mode: 0o600 });
  fs.writeFileSync(keyFile, key, { mode: 0o600 });
}

/**
 * What a certificate actually says — issuer, the names it covers, and when it stops working.
 *
 * OPS-07. Before this, a certificate was either accepted or refused and the admin was told nothing
 * else; the two questions people actually have ("is this the right cert?" and "when does it
 * expire?") had no answer anywhere in the product, and the second one has a deadline attached.
 * REFS app/admin/network/actions.ts · lib/tls/network.ts
 * PINS tests/unit/tls-certs.test.ts
 */
export function describeCertificate(certPem) {
  try {
    const info = acme.crypto.readCertificateInfo(certPem);
    const notAfter = info.notAfter ? new Date(info.notAfter) : null;
    const notBefore = info.notBefore ? new Date(info.notBefore) : null;
    const msLeft = notAfter ? notAfter.getTime() - Date.now() : 0;
    const issuer = info.issuer?.commonName ?? "";
    const subject = info.domains?.commonName ?? "";
    return {
      ok: true,
      issuer,
      subject,
      altNames: info.domains?.altNames ?? [],
      notBefore: notBefore ? notBefore.toISOString() : "",
      notAfter: notAfter ? notAfter.toISOString() : "",
      daysLeft: Math.floor(msLeft / 86_400_000),
      expired: !!notAfter && msLeft <= 0,
      notYetValid: !!notBefore && notBefore.getTime() > Date.now(),
      // Self-signed in the only sense that matters to a browser: nobody else vouches for it.
      selfSigned: !!issuer && !!subject && issuer === subject,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Read a PEM pair, or null when either half is missing. */
export function readPair(certFile, keyFile) {
  try {
    const cert = fs.readFileSync(certFile);
    const key = fs.readFileSync(keyFile);
    if (cert.length && key.length) return { cert, key };
  } catch {
    /* not present */
  }
  return null;
}

/**
 * The credential a given mode should serve, or null if it isn't ready yet.
 *
 * **`byo` prefers the imported copy and falls back to the configured paths.** Importing replaced
 * typing a path in 1.8.0, and an install that was already serving from a path must keep serving
 * after the update — silently losing HTTPS on upgrade would be a far worse bug than the one the
 * import solves.
 * REFS lib/tls/network.ts
 */
export function loadModeCert(cfg) {
  if (cfg.mode === "selfsigned") return readPair(SELF_CERT_FILE, SELF_KEY_FILE);
  if (cfg.mode === "byo") {
    const imported = readPair(BYO_CERT_FILE, BYO_KEY_FILE);
    if (imported) return imported;
    if (cfg.certPath && cfg.keyPath) return readPair(cfg.certPath, cfg.keyPath);
    return null;
  }
  if (cfg.mode === "letsencrypt") return readPair(CERT_FILE, KEY_FILE);
  return null;
}
