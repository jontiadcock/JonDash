import "server-only";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";
import { PROVIDER_PRESETS, type EmailMode, type EmailProvider } from "./constants";

export { PROVIDER_PRESETS };
export type { EmailMode, EmailProvider };

/**
 * Email (SMTP) configuration. Stored as a SINGLE encrypted `Setting` row so every
 * field — SMTP password, OAuth client secret, refresh token — is encrypted at
 * rest (a DB-only leak never exposes them). Two auth modes:
 *   - "password": SMTP username + (app) password.
 *   - "oauth2":   Google/Microsoft XOAUTH2 via a stored refresh token.
 */

export type EmailConfig = {
  enabled: boolean;
  mode: EmailMode;
  fromName: string;
  fromAddress: string;
  // shared: the mailbox / SMTP account address (also the XOAUTH2 user)
  user: string;
  // password mode
  host: string;
  port: number;
  secure: boolean;
  password: string;
  /**
   * Accept the mail server's TLS certificate even when it can't be traced to a trusted
   * authority (a private CA or a self-signed cert on an internal smarthost).
   *
   * This turns OFF the check that proves you're talking to the server you think you are,
   * so anything able to intercept the connection can read the mail and any credentials
   * sent with it. Off by default, opt-in per install, and deliberately NOT applied to
   * OAuth2 mode — that host is Google's or Microsoft's and always has a public cert, so
   * there is no legitimate reason to weaken it.
   */
  allowUntrustedCert: boolean;
  // oauth2 mode
  provider: EmailProvider;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRefreshToken: string;
};

export const EMAIL_DEFAULTS: EmailConfig = {
  enabled: false,
  mode: "password",
  fromName: "JonDash",
  fromAddress: "",
  user: "",
  host: "",
  port: 587,
  secure: false,
  password: "",
  allowUntrustedCert: false,
  provider: "",
  oauthClientId: "",
  oauthClientSecret: "",
  oauthRefreshToken: "",
};

const KEY = "email.config";

export async function readEmailConfig(): Promise<EmailConfig> {
  try {
    const row = await prisma.setting.findUnique({
      where: { scope_ownerId_key: { scope: "global", ownerId: "", key: KEY } },
    });
    if (row) {
      const raw = row.secret ? decryptString(row.valueJson) : row.valueJson;
      return { ...EMAIL_DEFAULTS, ...(JSON.parse(raw) as Partial<EmailConfig>) };
    }
  } catch {
    // fall through to defaults on any read/decrypt/parse error
  }
  return { ...EMAIL_DEFAULTS };
}

/** Merge a patch into the stored config and persist (encrypted). */
export async function writeEmailConfig(patch: Partial<EmailConfig>): Promise<EmailConfig> {
  const next: EmailConfig = { ...(await readEmailConfig()), ...patch };
  const stored = encryptString(JSON.stringify(next));
  await prisma.setting.upsert({
    where: { scope_ownerId_key: { scope: "global", ownerId: "", key: KEY } },
    create: { scope: "global", ownerId: "", key: KEY, valueJson: stored, secret: true },
    update: { valueJson: stored, secret: true },
  });
  return next;
}

/** True when the config is complete enough to attempt a send. */
export function isEmailConfigured(cfg: EmailConfig): boolean {
  if (cfg.mode === "oauth2") {
    return !!(cfg.provider && cfg.user && cfg.oauthClientId && cfg.oauthRefreshToken);
  }
  // A relay has no account, so there's no username to require — but with no account to
  // fall back on, the From address becomes the only source for the envelope sender.
  if (cfg.mode === "relay") return !!(cfg.host && cfg.fromAddress);
  return !!(cfg.host && cfg.user);
}
