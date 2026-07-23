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
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    ...TIMEOUTS,
  });
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
function explainMailError(err: string): string {
  const e = err.toLowerCase();

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
  if (e.includes("535") || e.includes("authentication") || e.includes("invalid_grant")) {
    return `${err}\n\nThe sign-in was rejected. For an app password, check it hasn't been revoked; for OAuth2, reconnect — a refresh token can be withdrawn without warning.`;
  }
  return err;
}

export async function sendTestEmail(to: string): Promise<SendResult> {
  const cfg = await readEmailConfig();

  // Separate "can't connect or sign in" from "connected but the send was rejected" — two
  // entirely different fixes, and the test button exists precisely to tell them apart.
  try {
    const transport = await buildTransport(cfg);
    await transport.verify();
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, error: explainMailError(raw) };
  }

  const res = await sendMail({
    to,
    subject: "JonDash test email",
    text:
      "This is a test email from your JonDash dashboard.\n\n" +
      "If you received it, outgoing email is configured correctly.",
  });
  return res.ok ? res : { ok: false, error: explainMailError(res.error) };
}
