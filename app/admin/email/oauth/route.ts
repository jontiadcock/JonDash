import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/guards";
import { userHasPermission } from "@/lib/auth/permissions";
import { getRequestOrigin, isSecureRequest } from "@/lib/request";
import { readEmailConfig } from "@/lib/email/config";
import { buildAuthUrl, isOAuthProvider } from "@/lib/email/oauth";
import { STATE_COOKIE, STATE_PATH } from "@/lib/email/constants";

export const dynamic = "force-dynamic";

/** Start the OAuth consent flow: redirect the admin to the provider. */
export async function GET() {
  const origin = await getRequestOrigin();
  const user = await getCurrentUser();
  if (!user || !(await userHasPermission(user, "email.manage"))) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const cfg = await readEmailConfig();
  if (!isOAuthProvider(cfg.provider) || !cfg.oauthClientId || !cfg.oauthClientSecret) {
    return NextResponse.redirect(new URL("/admin/email?error=oauth_config", origin));
  }

  const redirectUri = `${origin}/admin/email/oauth/callback`;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(cfg.provider, cfg.oauthClientId, redirectUri, state));
  // Lax (not Strict) so the cookie survives the top-level redirect back from the provider.
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: "lax",
    path: STATE_PATH,
    maxAge: 600,
  });
  return res;
}
