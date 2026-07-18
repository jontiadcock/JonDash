import "server-only";
import { headers } from "next/headers";

/**
 * Defence-in-depth CSRF check for mutating server actions.
 *
 * Next.js already blocks cross-origin Server Action POSTs by comparing Origin
 * and Host, and our session cookie is SameSite=Strict. This adds an explicit
 * same-origin assertion: the request's Origin (or Referer) host must match the
 * host the request was sent to. No configuration required.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");

  const origin = h.get("origin");
  if (origin) {
    if (host && safeHost(origin) === host) return;
    throw new Error("Cross-origin request rejected.");
  }

  // No Origin header (some same-origin navigations): fall back to Referer.
  const referer = h.get("referer");
  if (referer && host && safeHost(referer) === host) return;

  throw new Error("Cross-origin request rejected.");
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}
