import "server-only";
import { headers } from "next/headers";

/**
 * CSRF check for mutating server actions — and **since 1.8.3 this is the primary control, not a
 * third layer.**
 *
 * Next already blocks cross-origin Server Action POSTs by comparing Origin and Host. The session
 * cookie used to be `SameSite=Strict` and was a second barrier; it is `lax` now, because Strict
 * also withheld the cookie on ordinary top-level navigation and sent people to a login page they
 * did not need (BUG-73). `lax` still withholds it on cross-site POSTs, which is the vector.
 *
 * **So this function has to fail closed, and does:** the request's Origin — or, when a browser
 * omits it, the Referer — must match the host the request was sent to. **Neither present means
 * refused**, rather than allowed. Do not "simplify" that into a permissive fallback: with the
 * cookie relaxed, this is what stands between a mutating action and a cross-site caller.
 *
 * ## Related code
 * - `lib/auth/session.ts` — the cookie this replaced a layer of. Read its note before touching
 *   either; they are one decision expressed in two files.
 * - Called by every mutating server action (29 files at the time of writing) — `grep -rl
 *   assertSameOrigin app/` is the current list. A new action that forgets it has no CSRF check at
 *   all now.
 * - `tests/unit/csrf.test.ts` and `tests/unit/session-cookie-samesite.test.ts` — the behaviour and
 *   the fail-closed shape respectively.
 * REFS 31 callers — `git grep -l -w assertSameOrigin -- app lib`
 * PINS tests/unit/csrf.test.ts · tests/unit/helper-settings.test.ts
 *      tests/unit/permissions-view.test.ts · tests/unit/session-cookie-samesite.test.ts
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
