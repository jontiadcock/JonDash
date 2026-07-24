import "server-only";
import nodemailer from "nodemailer";
import { readEmailConfig, type EmailConfig } from "./config";
import { OAUTH_PROVIDERS, getAccessToken, isOAuthProvider } from "./oauth";

/**
 * Bounds on every stage of talking to a mail server (BUG-21).
 *
 * Nodemailer's own defaults are 2 minutes to connect and 10 to a dead socket — long enough
 * that a blocked port or a tenant with SMTP AUTH disabled reads as the app having frozen
 * rather than as a failure. `sendMail` catches and reports every *thrown* error, so a hang
 * was the single failure mode that produced no message at all.
 *
 * A `try/catch` around an unbounded call is a false sense of safety: it handles rejection,
 * not silence.
 */
const TIMEOUTS = {
  connectionTimeout: 15_000, // TCP connect — a blocked 587 fails here
  greetingTimeout: 15_000, // server accepted the socket but never said hello
  socketTimeout: 30_000, // went quiet mid-conversation
} as const;

async function buildTransport(cfg: EmailConfig) {
  if (cfg.mode === "oauth2") {
    if (!isOAuthProvider(cfg.provider)) throw new Error("Choose an OAuth provider (Google or Microsoft).");
    if (!cfg.oauthRefreshToken) throw new Error("Not connected yet — click Connect to authorize sending.");
    const meta = OAUTH_PROVIDERS[cfg.provider];
    const accessToken = await getAccessToken(
      cfg.provider,
      cfg.oauthClientId,
      cfg.oauthClientSecret,
      cfg.oauthRefreshToken,
    );
    return nodemailer.createTransport({
      host: meta.smtpHost,
      port: meta.smtpPort,
      secure: meta.smtpSecure,
      auth: { type: "OAuth2", user: cfg.user, accessToken },
      ...TIMEOUTS,
    });
  }

  if (!cfg.host) throw new Error("SMTP host is required.");

  // Opt-in escape hatch for an internal relay with a private or self-signed certificate.
  // Scoped to THIS transport only — never NODE_TLS_REJECT_UNAUTHORIZED, which would
  // disable certificate checking for every outbound connection the app makes, including
  // update downloads and module installs.
  const tls = cfg.allowUntrustedCert ? { tls: { rejectUnauthorized: false } } : {};

  // An IP-authorised relay has no account to sign in with. Send NO auth rather than
  // offering an empty credential — a server that advertises no AUTH and one that
  // rejects a bad password fail in different ways, and conflating them is what makes
  // this hard to diagnose.
  if (cfg.mode === "relay") {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      ...tls,
      ...TIMEOUTS,
    });
  }

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    ...tls,
    ...TIMEOUTS,
  });
}

/**
 * What the attempt was actually aimed at.
 *
 * Every failure below is reported with this prefix. The button uses the SAVED
 * configuration, not what's on screen, so "unable to get local issuer certificate"
 * with no target is unactionable — you cannot tell whether it even tried the host
 * you are looking at. Naming the target is what makes a stale save obvious.
 */
export function describeTarget(cfg: EmailConfig): string {
  if (cfg.mode === "oauth2") {
    const meta = isOAuthProvider(cfg.provider) ? OAUTH_PROVIDERS[cfg.provider] : null;
    return meta ? `${meta.smtpHost}:${meta.smtpPort} (OAuth2 as ${cfg.user || "?"})` : "the OAuth provider";
  }
  const tls = cfg.secure ? "TLS on connect" : "STARTTLS if offered";
  const as = cfg.mode === "relay" ? "no authentication" : `as ${cfg.user || "no username"}`;
  // Surfaced in every result so a weakened connection can't be quietly forgotten about
  // months after someone ticked the box to get past one error.
  const trust = cfg.allowUntrustedCert ? ", certificate NOT verified" : "";
  return `${cfg.host || "(no host set)"}:${cfg.port} (${tls}, ${as}${trust})`;
}

function fromHeader(cfg: EmailConfig): string {
  const addr = cfg.fromAddress || cfg.user;
  return cfg.fromName ? `"${cfg.fromName.replace(/"/g, "")}" <${addr}>` : addr;
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** Send an email using the saved configuration. Never throws. */
export async function sendMail(msg: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<SendResult> {
  const cfg = await readEmailConfig();
  try {
    const transport = await buildTransport(cfg);
    await transport.sendMail({
      from: fromHeader(cfg),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Turn a mail failure into something the admin can act on (OPS-13).
 *
 * "It failed" is not useful for an integration with this many external moving parts —
 * OAuth consent, tenant policy, blocked ports, revoked refresh tokens. The provider's own
 * error codes are the reliable signal, so they're mapped to the thing to go and change.
 */
export function explainMailError(err: string): string {
  const e = err.toLowerCase();

  // TLS mismatches. These are the errors that read as "the app is broken" because the
  // message never mentions mail, a host, or the setting that caused them.
  if (e.includes("wrong version number")) {
    return `${err}\n\nThat looks like "Use TLS on connect" being on for a port that expects plain SMTP first. Ports 25 and 587 want it OFF (they upgrade with STARTTLS); only port 465 wants it ON.`;
  }
  if (e.includes("unable to get local issuer certificate") || e.includes("unable to verify the first certificate")) {
    return `${err}\n\nThe server's TLS certificate could not be traced to a trusted authority. Usually one of: the host is an internal relay using a private or self-signed certificate; something on the network is intercepting SMTP and re-signing it; or the server didn't send its intermediate certificate. Check the SMTP host is the one you expect — this test uses the SAVED settings, so an older host may still be stored.`;
  }
  if (e.includes("self signed certificate") || e.includes("self-signed certificate")) {
    return `${err}\n\nThe mail server is using a self-signed certificate. That's common for an internal relay, but JonDash won't trust it silently — install the relay's certificate authority on this machine, or point at a host with a publicly trusted certificate.`;
  }
  if (e.includes("altnames") || e.includes("hostname/ip does not match")) {
    return `${err}\n\nThe certificate is valid but was issued for a different hostname. Use the name the certificate was issued for, not an IP address or an alias.`;
  }
  if (e.includes("certificate has expired")) {
    return `${err}\n\nThe mail server's certificate has expired — that's a problem at the server, not here.`;
  }

  if (e.includes("timeout") || e.includes("etimedout") || e.includes("greeting")) {
    return `${err}\n\nThe mail server didn't answer in time. Outbound SMTP (usually port 587 or 465) is often blocked on home and office connections — check that first.`;
  }
  if (e.includes("econnrefused")) {
    return `${err}\n\nThe connection was refused — check the host and port.`;
  }
  if (e.includes("enotfound") || e.includes("eai_again")) {
    return `${err}\n\nThat mail server hostname couldn't be resolved — check it for typos.`;
  }
  // The single most common M365 failure, and it's invisible without saying so: SMTP AUTH
  // is disabled per-mailbox by default and must be switched on even when using OAuth2.
  if (e.includes("smtpauth") || e.includes("smtp auth") || e.includes("disabled")) {
    return `${err}\n\nMicrosoft 365 disables SMTP AUTH per mailbox by default — it has to be enabled for this account even when using OAuth2.`;
  }
  // Sending credentials to a server that offers no AUTH at all — i.e. an IP-authorised
  // relay configured as if it were a mailbox. There is a mode for that.
  if (e.includes("no supported authentication") || e.includes("does not support auth")) {
    return `${err}\n\nThat server isn't offering authentication at all. If it's a relay that authorises by IP address, set Authentication to "Mail relay (no authentication)" — it will then connect without offering credentials.`;
  }
  if (e.includes("535") || e.includes("authentication") || e.includes("invalid_grant")) {
    return `${err}\n\nThe sign-in was rejected. For an app password, check it hasn't been revoked; for OAuth2, reconnect — a refresh token can be withdrawn without warning.`;
  }
  // Relay refusing the RECIPIENT rather than the sender — the usual wall after a relay
  // connects successfully, and it reads as a generic failure without saying so.
  if (e.includes("5.7.64") || e.includes("relay access denied") || e.includes("unable to relay")) {
    return `${err}\n\nThe server accepted the connection but refused to relay to that recipient. On Microsoft 365 direct send you can only reach addresses in your own tenant; sending anywhere else needs an inbound connector that authorises this IP for relay.`;
  }
  return err;
}

export async function sendTestEmail(to: string): Promise<SendResult> {
  const cfg = await readEmailConfig();
  const target = describeTarget(cfg);

  // Separate "can't connect or sign in" from "connected but the send was rejected" — two
  // entirely different fixes, and the test button exists precisely to tell them apart.
  try {
    const transport = await buildTransport(cfg);
    await transport.verify();
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Connecting to ${target} failed.\n\n${explainMailError(raw)}` };
  }

  const res = await sendMail({
    to,
    subject: "JonDash test email",
    text:
      "This is a test email from your JonDash dashboard.\n\n" +
      "If you received it, outgoing email is configured correctly.",
  });
  return res.ok
    ? res
    : { ok: false, error: `Connected to ${target}, but the send failed.\n\n${explainMailError(res.error)}` };
}
