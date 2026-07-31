import "server-only";

/** ⚠ Never remove this bound (BUG-21): the caller catches and reports thrown errors, so a HANG is
 *  the one failure mode that produces no message at all. REFS lib/email/send.ts › TIMEOUTS */
const TOKEN_TIMEOUT_MS = 15_000;

/**
 * OAuth2 (XOAUTH2) for sending mail via Google and Microsoft. ⚠ The admin registers their OWN
 * OAuth app — a self-hosted product cannot ship a shared client — so only the refresh token is
 * stored, and an access token is minted fresh per send.
 * REFS lib/email/config.ts — where those secrets are stored, encrypted
 *      app/admin/email/oauth/route.ts · oauth/callback/route.ts — the consent flow
 */

/** REFS lib/email/constants.ts › EmailProvider — the wider stored type, which also allows "" */
export type OAuthProvider = "google" | "microsoft";

type ProviderMeta = {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  extraAuthParams: Record<string, string>;
};

/** REFS lib/email/send.ts › describeTarget() · buildTransport() — the SMTP half of each entry
 *  PINS tests/integration/email.test.ts */
export const OAUTH_PROVIDERS: Record<OAuthProvider, ProviderMeta> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://mail.google.com/",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    // ⚠ Both are required, or Google returns no refresh_token and the connection lasts an hour.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  microsoft: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access https://outlook.office.com/SMTP.Send",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    extraAuthParams: { prompt: "consent" },
  },
};

/** REFS app/admin/email/oauth/route.ts · oauth/callback/route.ts · lib/email/send.ts */
export function isOAuthProvider(v: unknown): v is OAuthProvider {
  return v === "google" || v === "microsoft";
}

/** REFS app/admin/email/oauth/route.ts — the only caller; `state` is checked on the way back
 *       lib/email/constants.ts › STATE_COOKIE  PINS tests/integration/email.test.ts */
export function buildAuthUrl(
  provider: OAuthProvider,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const p = OAUTH_PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: p.scope,
    state,
    ...p.extraAuthParams,
  });
  return `${p.authorizeUrl}?${params.toString()}`;
}

async function tokenRequest(provider: OAuthProvider, params: Record<string, string>): Promise<{
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}> {
  const p = OAUTH_PROVIDERS[provider];
  // ⚠ The timeout is load-bearing (BUG-21): without it a token endpoint that never answers hangs
  // forever, and a hang is the one failure the caller's catch cannot report.
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  }).catch((e: unknown) => {
    const why =
      e instanceof Error && e.name === "TimeoutError"
        ? `the ${provider} sign-in service didn't respond within ${TOKEN_TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : String(e);
    throw new Error(`Couldn't reach ${provider} to authorise sending — ${why}.`);
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `Token endpoint returned ${res.status}.`);
  }
  return json;
}

/** Exchange an authorization code for a refresh token — the one moment a refresh token exists to
 *  be stored. REFS app/admin/email/oauth/callback/route.ts — the only caller; it writes the result
 *  through lib/email/config.ts › writeEmailConfig() */
export async function exchangeCode(
  provider: OAuthProvider,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string }> {
  const params: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  };
  if (provider === "microsoft") params.scope = OAUTH_PROVIDERS.microsoft.scope;
  const json = await tokenRequest(provider, params);
  if (!json.refresh_token) {
    throw new Error("No refresh token returned — re-consent with offline access enabled.");
  }
  return { refreshToken: json.refresh_token };
}

/** Mint a fresh access token from the stored refresh token, per send.
 *  REFS lib/email/send.ts › buildTransport() — the only caller */
export async function getAccessToken(
  provider: OAuthProvider,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const params: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };
  if (provider === "microsoft") params.scope = OAUTH_PROVIDERS.microsoft.scope;
  const json = await tokenRequest(provider, params);
  if (!json.access_token) throw new Error("Could not obtain an access token.");
  return json.access_token;
}
