import "server-only";
import { getPublicUrlSetting } from "@/lib/settings";

/**
 * The install's own address, for links that leave JonDash.
 *
 * ⚠ A SETTING, never derived from the request. Absolute URLs elsewhere come from
 * `x-forwarded-host`/`-proto`, which any client can send — there is no trusted-proxy concept
 * (BUG-41). In an email a forged header puts an attacker's link, branded as JonDash, into
 * somebody's inbox, where it is trusted and long-lived.
 * ⚠ No value means NO LINK. Guessing reintroduces the problem; a message without its button still
 * says everything it meant to say.
 *
 * This is a small slice of BUG-41 — enough to make mail safe. The rest (a canonical request
 * resolver, trusted-proxy config, stripping inbound `x-forwarded-*`) is still open.
 * PINS tests/unit/app-url.test.ts
 */

/** Root-relative only: `/m/backup-manager`. Anything else is refused rather than corrected. */
function isSafePath(path: string): boolean {
  // ⚠ `//evil.example` is protocol-relative and leaves the site entirely — the one input that
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
 * Resolve a root-relative path against the configured public URL. ⚠ Returns `null` when nothing is
 * configured or the path is unsafe, and callers must DROP the link rather than substitute one.
 * REFS lib/email/template.ts › BrandedEmail.cta · lib/modules/context.ts · lib/modules/types.ts
 * PINS tests/unit/app-url.test.ts
 */
export async function resolveAppUrl(path: string): Promise<string | null> {
  if (!isSafePath(path)) return null;
  const base = normaliseBase(await getPublicUrlSetting());
  return base ? `${base}${path}` : null;
}

/** The configured public URL, or "" — for showing an admin what is set. Normalised the same way
 *  as `resolveAppUrl` above, so the page cannot display something links would not use.
 *  PINS tests/unit/app-url.test.ts */
export async function getPublicUrl(): Promise<string> {
  return normaliseBase(await getPublicUrlSetting()) ?? "";
}
