// ACME HTTP-01 challenge tokens, on disk.
//
// Plain JS, no "server-only": written by the admin action that requests a certificate, read by
// server.mjs's plain-HTTP listener.

import fs from "node:fs";
import path from "node:path";
import { TLS_DIR } from "./network-config.mjs";

export const CHALLENGE_DIR = path.join(TLS_DIR, "challenge");

/**
 * **Why a directory and not the in-memory Map that already exists.**
 *
 * Let's Encrypt validates by fetching `/.well-known/acme-challenge/<token>` from this machine. The
 * listener that answers lives in `server.mjs`, outside the Next build — so when issuance is
 * triggered from the admin page (OPS-08: request a certificate without restarting), the code
 * holding the token and the code that must serve it are in different module graphs and cannot share
 * a variable. Issuance at boot keeps using the in-memory map; a request from the UI writes here,
 * and the listener checks both.
 *
 * A token is a short-lived public value — Let's Encrypt fetches it over plain HTTP by design — so
 * this is not secret material. The files are still 0600 and swept, because a stale token left
 * answering forever is untidy at best.
 */
function tokenPath(token) {
  // A token comes from the ACME server, but it lands in a filesystem path — so it is constrained
  // here rather than trusted. Anything with a separator or a dot in it never becomes a path.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) return null;
  return path.join(CHALLENGE_DIR, token);
}

export function putChallenge(token, keyAuthorization) {
  const file = tokenPath(token);
  if (!file) return false;
  fs.mkdirSync(CHALLENGE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, keyAuthorization, { mode: 0o600 });
  return true;
}

export function readChallenge(token) {
  const file = tokenPath(token);
  if (!file) return null;
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function removeChallenge(token) {
  const file = tokenPath(token);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
}

/** Drop everything left behind by an interrupted run. Called at startup and after issuance. */
export function clearChallenges() {
  try {
    for (const name of fs.readdirSync(CHALLENGE_DIR)) removeChallenge(name);
  } catch {
    /* nothing to clear */
  }
}
