// JonDash custom server.
//
// Replaces `next start` so the app can (optionally) terminate TLS itself:
//   * mode "off"        — plain HTTP on httpPort (default 3000). Identical to
//                         `next start`; this is the default when no config exists.
//   * mode "letsencrypt"— obtain/auto-renew a Let's Encrypt cert (HTTP-01) and
//                         serve HTTPS; HTTP port answers the ACME challenge and
//                         redirects to HTTPS.
//   * mode "byo"        — serve an admin-supplied cert/key; no ACME.
//
// Fail-open: any TLS problem (cert pending, issuance error, bad BYO paths) leaves
// the app serving over HTTP rather than failing to start. Errors are logged
// (redacted) and surfaced in the admin "cert status" panel.
//
// Plain JS on purpose (Node runs it directly, not through the Next compiler).

import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import fs from "node:fs";
import next from "next";
import { appendLog } from "./scripts/log.mjs";
import { readNetworkConfig, writeTlsStatus } from "./lib/tls/network-config.mjs";

const ACME_PREFIX = "/.well-known/acme-challenge/";
const cfg = readNetworkConfig();

const app = next({ dev: false });
const handle = app.getRequestHandler();

// token -> keyAuthorization, populated during an ACME order.
const challengeMap = new Map();
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
    const keyAuth = challengeMap.get(token);
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

function startHttps(cred) {
  if (httpsServer) {
    httpsServer.setSecureContext(cred); // hot-swap on renewal, no downtime
    log("tls", "cert-reloaded", "applied a renewed certificate without restart");
    return;
  }
  httpsServer = createHttpsServer(cred, (req, res) => handleApp(req, res, true));
  httpsServer.on("error", (e) => log("tls", "https-error", e.message));
  httpsServer.listen(cfg.httpsPort, () => {
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

function setupByo() {
  try {
    const cred = { cert: fs.readFileSync(cfg.certPath), key: fs.readFileSync(cfg.keyPath) };
    startHttps(cred);
    writeTlsStatus({ state: "ok", domain: cfg.domain, issuer: "bring-your-own", lastError: "" });
  } catch (e) {
    writeTlsStatus({ state: "error", lastError: `BYO cert load failed: ${String(e?.message ?? e)}` });
    log("tls", "byo-failed", String(e?.message ?? e));
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
  setupByo();
}
