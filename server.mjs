/*
 * JonDash custom server.
 *
 * Replaces `next start` so the app can (optionally) terminate TLS itself:
 *   * mode "off"        — plain HTTP on httpPort (default 3000). Identical to
 *                         `next start`; this is the default when no config exists.
 *   * mode "letsencrypt"— obtain/auto-renew a Let's Encrypt cert (HTTP-01) and
 *                         serve HTTPS; HTTP port answers the ACME challenge and
 *                         redirects to HTTPS.
 *   * mode "byo"        — serve an admin-supplied cert/key; no ACME.
 *
 * Fail-open: any TLS problem (cert pending, issuance error, bad BYO paths) leaves
 * the app serving over HTTP rather than failing to start. Errors are logged
 * (redacted) and surfaced in the admin "cert status" panel.
 *
 * Plain JS on purpose (Node runs it directly, not through the Next compiler).
 */

import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import next from "next";
import { appendLog } from "./scripts/log.mjs";
import { readNetworkConfigResult, writeTlsStatus, NETWORK_FILE } from "./lib/tls/network-config.mjs";
import { readChallenge, clearChallenges } from "./lib/tls/challenge-store.mjs";

const ACME_PREFIX = "/.well-known/acme-challenge/";
/*
 * BUG-28: a network.json that EXISTS but can't be parsed used to fall through to plain
 * HTTP on port 3000, silently. We can't tell from an unreadable file whether HTTPS was
 * configured, and guessing "no TLS" is the unsafe direction — so refuse to start and say
 * exactly what to fix, rather than quietly serving an HTTPS install unencrypted.
 */
const netResult = readNetworkConfigResult();
if (netResult.error) {
  console.error(
    `\n  Cannot start: your network settings file could not be read.\n` +
      `    File:  ${NETWORK_FILE}\n` +
      `    Error: ${netResult.error}\n\n` +
      `  JonDash will not start on plain HTTP by guessing, in case this install was set up\n` +
      `  for HTTPS. Fix the file, or delete it to start on http://localhost:3000.\n` +
      `  (A file saved with a UTF-8 BOM is the usual cause — re-save it as plain UTF-8.)\n`,
  );
  appendLog("start", "blocked", `unreadable network.json: ${netResult.error}`);
  process.exit(1);
}
const cfg = netResult.config;

const app = next({ dev: false });
const handle = app.getRequestHandler();

// token -> keyAuthorization, populated during an ACME order started at boot.
const challengeMap = new Map();
// A token left behind by an interrupted run would keep answering forever, and the next order's
// validation could be judged against it. Same reasoning as the supervisor clearing stale signals.
clearChallenges();
let httpsServer = null;

function log(phase, status, detail) {
  appendLog(phase, status, detail);
}

/** Serve a request through Next, tagging the scheme so the app knows it's HTTPS. */
function handleApp(req, res, secure) {
  if (secure) req.headers["x-forwarded-proto"] = "https";
  handle(req, res);
}

/** The HTTP listener: answers ACME challenges, else redirects to HTTPS (only
 *  once HTTPS is actually up), else serves the app over plain HTTP. */
function httpRequestHandler(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (pathname.startsWith(ACME_PREFIX)) {
    const token = pathname.slice(ACME_PREFIX.length);
    // In memory when issuance was started at boot; on disk when it was started from the admin page,
    // which runs inside Next and cannot reach this module's variables (OPS-08).
    const keyAuth = challengeMap.get(token) ?? readChallenge(token);
    if (keyAuth) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(keyAuth);
    } else {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  // Redirect to HTTPS only when it's serving; otherwise (cert still pending) keep
  // the site usable over HTTP so first-run issuance doesn't lock anyone out.
  if (httpsServer) {
    const host = (cfg.domain || req.headers.host || "").replace(/:\d+$/, "");
    const portSuffix = cfg.httpsPort === 443 ? "" : `:${cfg.httpsPort}`;
    res.writeHead(301, { Location: `https://${host}${portSuffix}${req.url}` });
    res.end();
    return;
  }

  handleApp(req, res, false);
}

/**
 * Record which certificate the listener is actually serving.
 *
 * ⚠ `servingNotAfter` is written ONLY here, by the code that binds the credential, which is what
 * makes it a fact rather than an inference. The admin page used to compare the stored expiry
 * against the file on disk — but a restart that serves an existing certificate writes no status at
 * all, so it reported "not until you restart" about a certificate already being served.
 * ⚠ Issuing a certificate writes `notAfter` and deliberately NOT this: installed is not served.
 * Best-effort — a status file is never worth failing a boot over.
 * REFS lib/tls/certs.mjs › writeTlsStatus() · app/admin/network/cert-panel.tsx — the reader
 */
function recordServing(cred) {
  import("./lib/tls/certs.mjs")
    .then(({ describeCertificate }) => {
      const info = describeCertificate(cred.cert);
      if (info.ok && info.notAfter) writeTlsStatus({ servingNotAfter: info.notAfter });
    })
    .catch(() => {});
}

function startHttps(cred) {
  if (httpsServer) {
    httpsServer.setSecureContext(cred); // hot-swap on renewal, no downtime
    recordServing(cred);
    log("tls", "cert-reloaded", "applied a renewed certificate without restart");
    return;
  }
  httpsServer = createHttpsServer(cred, (req, res) => handleApp(req, res, true));
  httpsServer.on("error", (e) => log("tls", "https-error", e.message));
  httpsServer.listen(cfg.httpsPort, () => {
    recordServing(cred);
    log("start", "https-listening", `HTTPS on :${cfg.httpsPort} for ${cfg.domain}`);
    console.log(`> HTTPS ready on https://${cfg.domain || "localhost"}:${cfg.httpsPort}`);
  });
}

async function setupLetsEncrypt() {
  const { obtainCertificate, loadCert, needsRenewal } = await import("./lib/tls/acme.mjs");

  // Serve immediately with any existing cert.
  const existing = loadCert();
  if (existing) startHttps(existing);

  async function ensure() {
    try {
      if (!needsRenewal(30)) return;
      const cred = await obtainCertificate({
        domain: cfg.domain,
        email: cfg.email,
        challengeMap,
        log,
      });
      startHttps(cred);
    } catch (e) {
      writeTlsStatus({ state: "error", lastError: String(e?.message ?? e) });
      log("tls", "issue-failed", String(e?.message ?? e));
    }
  }

  await ensure(); // first issuance (fail-open)
  // Re-check daily; unref so the timer never keeps the process alive on its own.
  setInterval(ensure, 24 * 60 * 60 * 1000).unref();
}

/**
 * Serve a certificate that already exists on disk — imported (bring-your-own) or generated here
 * (self-signed). Neither mode fetches anything, so this is just "load it and say what it is".
 *
 * **The status it writes names the certificate**, rather than the mode. "BYO cert loaded" told an
 * admin nothing they didn't already know; the issuer and expiry are the things worth surfacing, and
 * an expired certificate is called out here because the browser's complaint about one looks
 * identical to its complaint about an untrusted one.
 */
async function setupFileCert(label) {
  const { loadModeCert, describeCertificate } = await import("./lib/tls/certs.mjs");
  const cred = loadModeCert(cfg);
  if (!cred) {
    const how =
      cfg.mode === "selfsigned"
        ? "generate one in Admin → Network & HTTPS"
        : "import one in Admin → Network & HTTPS";
    writeTlsStatus({ state: "error", lastError: `No ${label} certificate is installed — ${how}.` });
    log("tls", "cert-missing", `${cfg.mode}: no certificate on disk`);
    return;
  }
  try {
    startHttps(cred);
    const info = describeCertificate(cred.cert);
    writeTlsStatus({
      state: info.ok && info.expired ? "error" : "ok",
      domain: cfg.domain,
      issuer: info.ok ? info.issuer || label : label,
      notAfter: info.ok ? info.notAfter : "",
      lastError: info.ok && info.expired ? "This certificate has expired." : "",
    });
    if (info.ok && info.expired) log("tls", "cert-expired", `${label} certificate has expired`);
  } catch (e) {
    writeTlsStatus({ state: "error", lastError: `Certificate load failed: ${String(e?.message ?? e)}` });
    log("tls", "cert-failed", String(e?.message ?? e));
  }
}

await app.prepare();

// The HTTP listener runs in every mode (in "off" it's the only one). Await the
// bind so the ACME challenge responder is definitely up before issuance starts.
const httpServer = createHttpServer(
  cfg.mode === "off" ? (req, res) => handleApp(req, res, false) : httpRequestHandler,
);
await new Promise((resolve) => httpServer.listen(cfg.httpPort, resolve));
log("start", "http-listening", `mode=${cfg.mode} HTTP on :${cfg.httpPort}`);
console.log(
  `> ${cfg.mode === "off" ? "http" : "http (redirects to https)"} ready on port ${cfg.httpPort}`,
);

if (cfg.mode === "letsencrypt") {
  setupLetsEncrypt().catch((e) => log("tls", "setup-failed", String(e?.message ?? e)));
} else if (cfg.mode === "byo") {
  setupFileCert("bring-your-own").catch((e) => log("tls", "setup-failed", String(e?.message ?? e)));
} else if (cfg.mode === "selfsigned") {
  setupFileCert("self-signed").catch((e) => log("tls", "setup-failed", String(e?.message ?? e)));
}
