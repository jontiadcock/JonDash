// ACME (Let's Encrypt) certificate acquisition + renewal, HTTP-01 challenge.
//
// Plain JS, imported only by server.mjs (runs outside Next). Uses acme-client.
// Cert material is written to .data/tls/ at 0600. Never logs key material.

import fs from "node:fs";
import acme from "acme-client";
import {
  TLS_DIR,
  ACCOUNT_KEY_FILE,
  CERT_FILE,
  KEY_FILE,
  writeTlsStatus,
} from "./network-config.mjs";

// Let's Encrypt staging avoids the strict production rate limits — set
// ACME_STAGING=1 in .env while testing so a misconfig can't burn the weekly quota.
function directoryUrl() {
  return process.env.ACME_STAGING === "1"
    ? acme.directory.letsencrypt.staging
    : acme.directory.letsencrypt.production;
}

async function loadOrCreateAccountKey() {
  try {
    return fs.readFileSync(ACCOUNT_KEY_FILE);
  } catch {
    const key = await acme.crypto.createPrivateKey();
    fs.mkdirSync(TLS_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(ACCOUNT_KEY_FILE, key, { mode: 0o600 });
    return key;
  }
}

/** The current cert + key from disk, or null if not both present/readable. */
export function loadCert() {
  try {
    const cert = fs.readFileSync(CERT_FILE);
    const key = fs.readFileSync(KEY_FILE);
    if (cert.length && key.length) return { cert, key };
  } catch {
    /* not issued yet */
  }
  return null;
}

/** notAfter Date of a PEM cert, or null. */
export function certNotAfter(certPem) {
  try {
    return acme.crypto.readCertificateInfo(certPem).notAfter ?? null;
  } catch {
    return null;
  }
}

/** True when there is no cert, or it expires within `days` days. */
export function needsRenewal(days = 30) {
  const existing = loadCert();
  if (!existing) return true;
  const notAfter = certNotAfter(existing.cert);
  if (!notAfter) return true;
  const msLeft = new Date(notAfter).getTime() - Date.now();
  return msLeft < days * 24 * 60 * 60 * 1000;
}

/**
 * Obtain (or renew) a certificate for `domain` via HTTP-01. The challenge is
 * answered through the shared in-memory `challengeMap` that server.mjs's HTTP
 * listener serves at /.well-known/acme-challenge/<token>.
 *
 * Returns { cert, key } on success; throws on failure (caller keeps serving the
 * old cert / HTTP-only and records the error).
 */
export async function obtainCertificate({ domain, email, challengeMap, log }) {
  if (!domain) throw new Error("no domain configured");
  writeTlsStatus({ state: "issuing", domain, lastError: "" });
  log?.("tls", "issue-start", `requesting certificate for ${domain}`);

  const accountKey = await loadOrCreateAccountKey();
  const client = new acme.Client({ directoryUrl: directoryUrl(), accountKey });

  const [key, csr] = await acme.crypto.createCsr({ commonName: domain });

  const cert = await client.auto({
    csr,
    email: email || undefined,
    termsOfServiceAgreed: true,
    challengePriority: ["http-01"],
    challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
      if (challenge.type === "http-01") challengeMap.set(challenge.token, keyAuthorization);
    },
    challengeRemoveFn: async (_authz, challenge) => {
      if (challenge.type === "http-01") challengeMap.delete(challenge.token);
    },
  });

  fs.mkdirSync(TLS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CERT_FILE, cert, { mode: 0o600 });
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });

  const notAfter = certNotAfter(cert);
  let issuer = "";
  try {
    issuer = acme.crypto.readCertificateInfo(cert).issuer?.commonName ?? "";
  } catch {
    /* best-effort */
  }
  writeTlsStatus({
    state: "ok",
    domain,
    issuer,
    notAfter: notAfter ? new Date(notAfter).toISOString() : "",
    lastRenewal: new Date().toISOString(),
    lastError: "",
  });
  log?.("tls", "issue-ok", `certificate for ${domain} valid until ${notAfter}`);
  return { cert: Buffer.from(cert), key: Buffer.from(key) };
}
