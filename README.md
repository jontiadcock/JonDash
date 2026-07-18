# JonDash

**[Features](#features) · [Quick start](#turn-it-on-windows) · [Using it](#using-it) · [Security](#security-measures) · [Changelog](CHANGELOG.md) · [Roadmap](docs/ROADMAP.md)**

A modern, login-protected dashboard where each user sees a personal grid of
service tiles (icon + name → link). You (the admin) customise what each user
sees; everything is managed in the web interface — **no coding or file editing
required.**

- **Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Prisma + SQLite
- **Sign-in:** password **+ authenticator-app code (two-factor)**

---

## Features

- **Per-user dashboards** — each person sees only the service tiles you give them.
- **Service Groups** — bundle tiles into a group and assign it to many users at once.
- **Two-factor sign-in** with **backup recovery codes** if you lose your authenticator.
- **Account self-service** — users change their own password and re-enrol their authenticator.
- **Session manager** — view and revoke active sign-ins (device, approximate location).
- **Audit log** and configurable **Settings** (sign-in message, session/idle timeouts, retention).
- **Backup & restore** — export/import your data; accounts only leave in an encrypted file.
- **Secure by default** and **zero-config** — keys, database, and site address set up on first run.

See the [changelog](CHANGELOG.md) for what changed in each version.

---

## Turn it on (Windows)

1. Make sure **Node.js** is installed (one-time). If not, get the "LTS" version
   from <https://nodejs.org> and click through the installer.
2. **Double-click `start-dashboard.bat`.**
3. Your browser opens at **http://localhost:3000**. The first time, it walks you
   through creating your administrator account (email, password, and scanning a
   QR code into an authenticator app such as Google Authenticator or Authy).

That's it. Leave the black window open while you use the dashboard; close it to
stop. To start again later, just double-click `start-dashboard.bat` again.

> Nothing to configure by hand: the database, security keys, and site address
> are all set up automatically the first time it runs.

## Using it

- **You (admin)** get an **Admin** area with a **Menu** dropdown covering:
  - **Users** — create accounts (you get a **one-time setup link** to send to each person),
    manage each user's tiles, assign Service Groups, reset access, disable/delete.
  - **Service Groups** — create shared tile bundles and manage their services.
  - **Sessions**, **Audit**, **Backup**, and **Settings**.
  - Uploading an icon per tile (PNG/JPEG/WebP/GIF).
- **Users** sign in and click their tiles. From **Account** they can change their password,
  re-enrol their authenticator, view recovery codes, and manage their own sessions.

When you create a user, share the setup link with them. They open it, choose a
password, scan the QR code, save their recovery codes, and they're in.

---

## Running on a server (advanced / optional)

The app is a standard Next.js server and can run on a Linux VPS:

```bash
npm ci
npm run db:migrate      # apply the database schema
npm run build
npm run start           # serves on port 3000
```

- Run it under a process manager (systemd/pm2) and put **nginx or Caddy in front
  to add HTTPS**, proxying to `127.0.0.1:3000`. When the site is served over
  HTTPS, the app automatically switches cookies to Secure and enables HSTS — no
  setting to flip.
- Forward the real host/scheme/IP (`X-Forwarded-Host` / `X-Forwarded-Proto` /
  `X-Forwarded-For`) from the proxy; these are set by nginx/Caddy by default.
- **Back up** the `prisma/` database file, the `uploads/` folder (icons), and the
  `.data/` folder (auto-generated encryption key). Losing `.data/` makes stored
  two-factor secrets unrecoverable, so keep a copy.

## Security measures

- Passwords hashed with **argon2id**; strength policy enforced.
- **Two-factor (TOTP)** required; secrets **encrypted at rest** (AES-256-GCM,
  key auto-generated into `.data/secrets.json`).
- **Sessions:** opaque random tokens stored **hashed**; httpOnly, SameSite=Strict
  cookies, Secure automatically when on HTTPS; server-side expiry; revocable.
- **Rate limiting / lockout** on password and two-factor attempts.
- **XSS:** React auto-escaping only; service links restricted to `http`/`https`
  and opened with `rel="noopener noreferrer"`.
- **Uploads (admin only):** type-checked, size-capped, re-encoded to PNG with
  `sharp` (strips embedded payloads), stored outside the web root, served via an
  authenticated, ownership-checked route with `nosniff`.
- **CSRF:** SameSite=Strict cookies + same-origin assertion on every change.
- **Hardened headers** (`proxy.ts`): nonce-based CSP, `frame-ancestors 'none'`,
  `nosniff`, `Referrer-Policy`, HSTS (on HTTPS), `Permissions-Policy`.
- **Authorization** enforced server-side on every protected page/action/route.
- **Audit log** of sign-in and admin actions.

## For maintainers

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Development server (relaxed CSP for HMR)      |
| `npm run build`      | Production build                             |
| `npm run start`      | Run the production build                     |
| `npm run db:migrate` | Apply database migrations                    |
| `npm run typecheck`  | `tsc --noEmit`                              |
| `npm run lint`       | ESLint                                       |

The first admin is created through the `/welcome` wizard in the browser. A
command-line alternative (`npm run db:seed`) also exists but isn't needed.

### Project layout

```
app/
  welcome/          first-run wizard: create the first admin (GUI)
  login/            two-step login (password → authenticator code)
  setup/[token]/    a user completes their account from an invite link
  (app)/dashboard/  user service grid (view-only)
  admin/            users list, per-user link management, icon upload
  api/icons/[id]/   authenticated, ownership-checked icon serving
lib/
  auth/             password, totp, session, preauth, guards, bootstrap
  security/         csrf, upload processing, rate limit
  config.ts         auto-generated encryption key
  request.ts        site URL / HTTPS derived from the request
  crypto.ts db.ts audit.ts icons.ts validation/
prisma/             schema, migrations
proxy.ts            security headers + auth gate
start-dashboard.bat one-click launcher (Windows)
```
