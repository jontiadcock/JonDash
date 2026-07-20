import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/guards";
import { userHasPermission } from "@/lib/auth/permissions";
import { getRequestOrigin } from "@/lib/request";
import { readEmailConfig, writeEmailConfig } from "@/lib/email/config";
import { exchangeCode, isOAuthProvider } from "@/lib/email/oauth";
import { audit } from "@/lib/audit";
import { STATE_COOKIE, STATE_PATH } from "@/lib/email/constants";

export const dynamic = "force-dynamic";

/** OAuth callback: verify state, exchange the code for a refresh token, store it. */
export async function GET(req: Request) {
  const origin = await getRequestOrigin();
  const user = await getCurrentUser();
  if (!user || !(await userHasPermission(user, "email.manage"))) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;

  function back(query: string): NextResponse {
    const res = NextResponse.redirect(new URL(`/admin/email?${query}`, origin));
    res.cookies.set(STATE_COOKIE, "", { path: STATE_PATH, maxAge: 0 }); // one-time use
    return res;
  }

  if (providerError) return back(`error=${encodeURIComponent(providerError)}`);
  if (!code || !state || !expected || state !== expected) return back("error=state");

  const cfg = await readEmailConfig();
  if (!isOAuthProvider(cfg.provider)) return back("error=oauth_config");

  try {
    const { refreshToken } = await exchangeCode(
      cfg.provider,
      cfg.oauthClientId,
      cfg.oauthClientSecret,
      code,
      `${origin}/admin/email/oauth/callback`,
    );
    await writeEmailConfig({ oauthRefreshToken: refreshToken, mode: "oauth2" });
    await audit("admin.email.oauth.connected", { userId: user.id, detail: cfg.provider });
    return back("connected=1");
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "exchange_failed")}`);
  }
}
