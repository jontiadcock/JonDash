import "server-only";
import { getPublicUrlSetting } from "@/lib/settings";

/**
 * The install's own address, for building links that leave JonDash (1.8.0).
 *
 * **Why this is a setting and not derived from the request.** JonDash builds absolute URLs today
 * from `x-forwarded-host` / `x-forwarded-proto`, which any client can send — there is no
 * trusted-proxy concept anywhere (BUG-41). On a settings page a forged header shows a wrong link
 * to somebody who is already signed in and looking at it. **In an email it is materially worse:**
 * a forged header puts an attacker's link, branded as JonDash, into somebody's inbox, where it is
 * trusted and long-lived. So mail links come from a value an admin set, or they do not exist.
 *
 * **No value means no link, deliberately.** Guessing would reintroduce exactly the problem this
 * avoids. A message without its button still says everything it was going to say; a message with
 * a link to the wrong host is a phishing email JonDash sent on somebody else's behalf.
 *
 * This is a deliberately small slice of BUG-41 — enough to make mail safe. The full fix (one
 * canonical request resolver, trusted-proxy configuration, stripping inbound `x-forwarded-*` on
 * the plain listener) is still open and still needed for sessions, the audit log and rate limiting.
 */

/** Root-relative only: `/m/backup-manager`. Anything else is refused rather than corrected. */
function isSafePath(path: string): boolean {
  // `//evil.example` is protocol-relative and would leave the site entirely — the one input that
  // looks like a path and is not.
  return path.startsWith("/") && !path.startsWith("//");
}

/** Trim to an origin: scheme + host + optional port, no trailing slash, no path. */
function normaliseBase(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Resolve a root-relative path against the configured public URL.
 *
 * Returns `null` when nothing is configured or the path is not safe — callers drop the link
 * rather than sending a broken or dangerous one.
 */
export async function resolveAppUrl(path: string): Promise<string | null> {
  if (!isSafePath(path)) return null;
  const base = normaliseBase(await getPublicUrlSetting());
  return base ? `${base}${path}` : null;
}

/** The configured public URL, or "" — for showing an admin what is set. */
export async function getPublicUrl(): Promise<string> {
  return normaliseBase(await getPublicUrlSetting()) ?? "";
}
