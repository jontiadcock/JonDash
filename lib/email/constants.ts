/*
 * ⚠ Client-safe: NO `server-only` import, so `app/admin/email/ui.tsx` can use these. Adding one
 * breaks that page's build. REFS lib/email/config.ts — the server half, which re-exports them
 */

/**
 * How JonDash authenticates to the mail server: "password" (SMTP user + app password), "oauth2"
 * (XOAUTH2 via a stored refresh token), or "relay" — ⚠ NO authentication at all, for a smarthost
 * that authorises by source IP. Offering an empty credential to a server advertising no AUTH fails
 * differently from a rejected password, so relay mode sends none.
 * REFS lib/email/send.ts › buildTransport() — the branch per mode
 */
export type EmailMode = "password" | "oauth2" | "relay";
/** "" means password mode with a preset, not OAuth. REFS lib/email/oauth.ts › OAuthProvider —
 *  the narrower type; the two must not drift */
export type EmailProvider = "google" | "microsoft" | "";

/** SMTP presets for password mode; host, port and secure stay overridable.
 *  REFS app/admin/email/ui.tsx — the provider dropdown  PINS tests/integration/email.test.ts */
export const PROVIDER_PRESETS: Record<
  string,
  { label: string; host: string; port: number; secure: boolean }
> = {
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { label: "Outlook / Hotmail", host: "smtp-mail.outlook.com", port: 587, secure: false },
  office365: { label: "Microsoft 365", host: "smtp.office365.com", port: 587, secure: false },
  custom: { label: "Custom", host: "", port: 587, secure: false },
};

// ⚠ Shared by BOTH OAuth routes — the callback compares what the initiate route set, so the
// name and path must stay identical. REFS app/admin/email/oauth/route.ts · oauth/callback/route.ts
export const STATE_COOKIE = "email_oauth_state";
/** REFS app/admin/email/oauth/route.ts · oauth/callback/route.ts — the cookie's Path must cover
 *  the callback or the browser will not send it back */
export const STATE_PATH = "/admin/email";
