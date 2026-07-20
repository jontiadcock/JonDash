import "server-only";
import nodemailer from "nodemailer";
import { readEmailConfig, type EmailConfig } from "./config";
import { OAUTH_PROVIDERS, getAccessToken, isOAuthProvider } from "./oauth";

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
    });
  }

  if (!cfg.host) throw new Error("SMTP host is required.");
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
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

export async function sendTestEmail(to: string): Promise<SendResult> {
  return sendMail({
    to,
    subject: "JonDash test email",
    text:
      "This is a test email from your JonDash dashboard.\n\n" +
      "If you received it, outgoing email is configured correctly.",
  });
}
