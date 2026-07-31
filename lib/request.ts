import "server-only";
import { headers } from "next/headers";

/**
 * Values derived from the incoming request, so nothing has to be configured by hand.
 *
 * ⚠ Behind a proxy these read `X-Forwarded-*`, which ANY client can send — there is no
 * trusted-proxy concept anywhere yet (BUG-41). Never use them for anything that leaves the app.
 * REFS lib/app-url.ts — why mail links use a configured setting instead of these
 */

/** True when the request reached us over HTTPS. ⚠ Drives the `Secure` cookie flag, so a wrong
 *  answer means a session cookie sent in the clear.
 *  REFS lib/auth/session.ts · lib/auth/preauth.ts · lib/auth/reenroll.ts · recovery-reveal.ts */
export async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]?.trim() === "https";
  // Fallback: some setups signal the scheme with `x-forwarded-ssl` instead.
  return h.get("x-forwarded-ssl") === "on";
}

/** The host the client used, proxy-aware. ⚠ Client-controlled — see the file note above.
 *  REFS getRequestOrigin() below — the only caller */
export async function getRequestHost(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

/** Absolute origin the client used. ⚠ Client-controlled (BUG-41) — fine for a link shown to the
 *  person who just made the request, never for one that leaves the app.
 *  REFS lib/app-url.ts — the configured alternative mail uses instead
 *       app/admin/email/oauth/route.ts · oauth/callback/route.ts — the OAuth redirect_uri */
export async function getRequestOrigin(): Promise<string> {
  const host = (await getRequestHost()) ?? "localhost:3000";
  const scheme = (await isSecureRequest()) ? "https" : "http";
  return `${scheme}://${host}`;
}
