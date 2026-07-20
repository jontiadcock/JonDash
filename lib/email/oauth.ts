import "server-only";

/**
 * OAuth2 (XOAUTH2) for sending mail via Google and Microsoft. The admin registers
 * their own OAuth app (we can't ship a shared client for a self-hosted app),
 * connects it via a consent flow, and we store the refresh token. Access tokens
 * are minted fresh from the refresh token per send.
 */

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

export const OAUTH_PROVIDERS: Record<OAuthProvider, ProviderMeta> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://mail.google.com/",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    // access_type=offline + prompt=consent guarantees a refresh_token is returned.
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

export function isOAuthProvider(v: unknown): v is OAuthProvider {
  return v === "google" || v === "microsoft";
}

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
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
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

/** Exchange an authorization code for a refresh token. */
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

/** Mint a fresh access token from the stored refresh token (used per send). */
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
