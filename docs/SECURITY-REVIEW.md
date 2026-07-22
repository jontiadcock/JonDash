# JonDash — Security Review & Test Report (2026-07-18)

> Authorized testing of the owner's own app on `localhost`, production build.
> Testing performed on a throwaway dataset; the owner's real data was backed up and
> restored afterward. **No code changes made** — this is findings + a plan for review.
>
> **This is a dated report and is deliberately not rewritten.** It reflects the app as of
> 2026-07-18 — **before modules and helpers existed** (v1.4.0 / v1.5.0), so nothing here
> covers the module install path, the install-time verifier, or helper privilege. Treat those
> as unreviewed. Findings below are marked fixed where a later release addressed them; the
> rest remain open and are tracked in `ROADMAP.md` under the security hardening backlog.

## Verdict

Core security posture is **strong**. No High/Critical issues found. Auth, access control
(RBAC/IDOR), output encoding, and security headers all behave correctly. The findings below
are hardening opportunities (mostly Low/Info), several already on the roadmap.

## What passed (verified live)

- **Security headers** (prod): nonce-based CSP with `strict-dynamic`, `default-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`. HSTS correctly present only over HTTPS.
- **Route protection**: `/admin`, `/dashboard`, `/admin/*` redirect to `/login` when
  unauthenticated (proxy gate) **and** enforce `requireUser`/`requireAdmin` server-side
  (a normal user hitting an admin page is redirected — defence in depth).
- **API authorization**: `/api/update/status` & `/api/update/apply` return **403** to both
  anonymous and non-admin users; `/api/icons/*` returns **401** anonymously. A normal user
  therefore **cannot** trigger the update/restart.
- **IDOR / access control**: as user2, fetching **user1's** private icon → **403**; fetching
  a **role icon for a role they aren't in** → **403**.
- **Sensitive files not served**: `/.env`, `/.data/secrets.json`, `/prisma/dev.db` → **404**.
- **XSS**: a tile titled `<img onerror=…><script>…` is stored raw but **rendered escaped**
  (`&lt;`), created no `<img>`/`<script>` nodes, and raised no CSP violations. React
  auto-escaping holds.
- **Session cookie**: `httpOnly` (invisible to JS); `SameSite=Strict`; `Secure` set over
  HTTPS (correctly off on plain-http localhost).
- **Account lockout**: failure counter increments; when locked, **even the correct password
  is rejected** ("Account temporarily locked").
- **Login errors are generic** (no username enumeration via messages); self-account
  disable/delete is blocked for admins; passwords hashed with **argon2id**; TOTP secrets
  **encrypted at rest**.

## Findings (hardening opportunities)

| # | Sev | Finding | Recommendation |
|---|-----|---------|----------------|
| 1 | **Med** | **No account recovery** — lost authenticator = permanent lockout (no backup codes, no email reset yet). Availability risk. | 2FA **backup codes** (already next on roadmap) + email-based reset. |
| 2 | Low | **Login timing enumeration** — unknown email returns fast (no hash), valid email runs argon2 (slow); timing can reveal valid addresses. | Run a **dummy argon2 verify** for unknown users to equalize timing. |
| 3 | Low | **Update = trust concentration** — whoever controls `origin/main` gets code execution on the host via `git pull`. (Admin-only + same-origin — good.) | Verify **signed tags/commits** before applying; document the trust model; keep it launcher-supervised. |
| 4 | Low | **Rate limiting is in-memory & per-IP** — resets on restart, single-instance only; behind a proxy, `X-Forwarded-For` must come from a *trusted* proxy or it's spoofable. | Note for the IP-policy features; consider a durable store + strict trusted-proxy parsing. |
| 5 | Low | **No self-service session management** — 7-day sessions, no idle timeout, no user-visible "active sessions"/revoke, no token rotation on privilege change. | Session manager (already on roadmap). |
| 6 | Low | **TOTP replay** — a code can be reused within its ~30–60s window (no last-step tracking). | Record last-used TOTP step per user and reject reuse. |
| 7 | Info | CSP uses `style-src 'unsafe-inline'`; the icon route's stricter CSP is overridden by the global CSP (nosniff still applies). | Tighten later (hashed styles; let the icon route's headers win). Low risk. |
| 8 | Info | Possible `X-Powered-By` fingerprinting header. | Set `poweredByHeader: false` in `next.config`. |
| 9 | Info | `assertSameOrigin` throws (500-style) on server actions instead of a clean handled error. | Wrap for a graceful, consistent rejection. |
| 10 | Info | Setup token TTL is 7 days and travels in a URL (already one-time; invalidated on completion). | Consider a shorter default TTL. |

## Not fully exercised live (code-verified / recommend re-test)

- **TOTP throttle (6/min)** and **password IP throttle (10/min)** — code present; not driven
  to the limit this round.
- **CSRF with a forged cross-origin Origin** on an authenticated mutation — not driven
  (httpOnly cookie couldn't be replayed outside the browser). Relies on `SameSite=Strict` +
  Next's built-in server-action origin check + `assertSameOrigin`.
- **Pre-auth bypass** (TOTP step without the password step) — enforced in code via the
  encrypted pre-auth cookie; not force-tested.
- **Icon upload validation** (magic-byte allowlist, SVG rejection, 2 MB cap, polyglot
  re-encode) — pipeline verified earlier via script; not re-driven (browser file-picker limit).
- **URL scheme rejection** (`javascript:`/`data:`) — verified in earlier sessions; code unchanged.

## Prioritized remediation plan

**Quick + high value (do first — mostly already queued):**
1. 2FA **backup codes** (finding #1) — already the next roadmap item.
2. **Dummy argon2 on unknown user** (finding #2) — tiny change.
3. `poweredByHeader: false` (finding #8) — trivial.

**Soon:**
4. **Email-based password reset** (finding #1) — roadmap.
5. **Session manager** — active sessions + revoke (finding #5) — roadmap.
6. Graceful same-origin rejection (finding #9).

**With the IP/country policy work:**
7. **Durable rate-limit + strict trusted-proxy `X-Forwarded-For`** handling (finding #4).

**Hardening backlog:**
8. TOTP **replay prevention** (finding #6); tighten CSP + icon headers (finding #7);
   **signed-update verification** (finding #3); optional breached-password (HIBP) check.

**Process:**
9. Add **automated authz/security regression tests** + CI before going public — for a
   security tool, lock these behaviors so they can't silently regress.
