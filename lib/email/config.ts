import "server-only";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";
import { PROVIDER_PRESETS, type EmailMode, type EmailProvider } from "./constants";

export { PROVIDER_PRESETS };
export type { EmailMode, EmailProvider };

/**
 * Email (SMTP) configuration. ⚠ Stored as ONE encrypted `Setting` row so every field — SMTP
 * password, OAuth client secret, refresh token — is encrypted at rest and a database-only leak
 * exposes none of them. Splitting a field out into its own row would break that.
 *
 * REFS lib/crypto.ts › encryptString() · decryptString() — the envelope
 *      lib/email/send.ts — the reader · app/admin/email/actions.ts — the writer
 * PINS tests/integration/email.test.ts
 */

/** REFS lib/email/send.ts › buildTransport() — every field below drives it
 *       app/admin/email/actions.ts — the form that writes them */
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
   * Accept the mail server's TLS certificate even when it cannot be traced to a trusted authority.
   *
   * ⚠ This turns OFF the check that proves you are talking to the server you think you are, so
   * anything intercepting the connection can read the mail and the credentials sent with it. Off by
   * default, and never applied to OAuth2 mode — that host always has a public cert.
   * REFS lib/email/send.ts › buildTransport() — scopes it to one transport, never globally
   */
  allowUntrustedCert: boolean;
  // oauth2 mode
  provider: EmailProvider;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRefreshToken: string;
};

/** PINS tests/integration/email.test.ts — no core caller; `readEmailConfig` merges over it */
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

/** REFS lib/email/send.ts · app/admin/email/page.tsx · app/admin/email/oauth/route.ts ·
 *       app/admin/email/oauth/callback/route.ts  PINS tests/integration/email.test.ts */
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

/** Merge a patch into the stored config and persist it encrypted. ⚠ Merges over the CURRENT
 *  stored value, so a partial write cannot blank the fields it omits.
 *  REFS app/admin/email/actions.ts · app/admin/email/oauth/callback/route.ts
 *  PINS tests/integration/email.test.ts */
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

/** True when the config is complete enough to attempt a send. Each mode needs different fields.
 *  PINS tests/integration/email.test.ts — the only caller outside this file */
export function isEmailConfigured(cfg: EmailConfig): boolean {
  if (cfg.mode === "oauth2") {
    return !!(cfg.provider && cfg.user && cfg.oauthClientId && cfg.oauthRefreshToken);
  }
  // A relay has no account, so there's no username to require — but with no account to
  // fall back on, the From address becomes the only source for the envelope sender.
  if (cfg.mode === "relay") return !!(cfg.host && cfg.fromAddress);
  return !!(cfg.host && cfg.user);
}
