# JonDash

**[Features](#features) · [Quick start](#turn-it-on-windows) · [Using it](#using-it) · [Modules](#modules--addons) · [Security](#security-measures) · [Changelog](CHANGELOG.md) · [Roadmap](docs/ROADMAP.md)**

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
- **Delegated admin** — grant specific admin powers to a user with **Access Roles**, without full admin.
- **Account self-service** — users change their own password and re-enrol their authenticator.
- **Session manager** — view and revoke active sign-ins (device, approximate location).
- **Audit log** and configurable **Settings** (sign-in message, session/idle timeouts, retention).
- **Full server backup & selective restore** — export your whole instance to one file; an encrypted backup
  also carries credentials and keys, so your authenticator (2FA) keeps working after a restore/migration.
- **Optional HTTPS** — an automatic Let's Encrypt certificate or bring-your-own, with configurable ports
  (off by default).
- **Outgoing email** — connect an SMTP account (app-password or OAuth2), set up in the app.
- **One-click updates** — choose a **Stable** or **Beta** channel and update from inside the app; a
  self-supervising launcher captures crashes, auto-restarts, and **rolls back a failed update**.
- **Restart / shut down** the server from the Settings area.
- **Modules (in development)** — plug in optional addons that add features **without touching the base app**;
  see [Modules & addons](#modules--addons).
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

- **You (admin)** get a **Settings** area (a left sidebar grouped **General · Server settings · Security**)
  covering:
  - **Users** — create accounts (you get a **one-time setup link** to send to each person),
    manage each user's tiles, assign Service Groups, reset access, disable/delete.
  - **Service Groups** and **Access Roles** (delegated-admin capability bundles).
  - **Sessions**, **Audit log**, and **General settings**.
  - **Server settings** — Updates, Backup & restore, Network & HTTPS, Email, and Server power
    (restart / shut down).
  - Uploading an icon per tile (PNG/JPEG/WebP/GIF).
- **Users** sign in and click their tiles. From **Account** they can change their password,
  re-enrol their authenticator, view recovery codes, and manage their own sessions.

When you create a user, share the setup link with them. They open it, choose a
password, scan the QR code, save their recovery codes, and they're in.

---

## Modules & addons

Modules are optional addons that plug extra features into JonDash — a dashboard widget, their own page(s),
and their own settings — **without changing the base app**. Disable or remove a module and JonDash works
exactly as before (like removing an app from a phone). At install you're shown the **permissions** a module
requests (e.g. "can make outbound network requests", "can read your user accounts") and you approve them,
app-store style.

Three ways to add one:
- **From a source** — the built-in official modules source, or **any public git repo you add by URL**, then
  pick a module to install. Modules update **independently** of the base app.
- **Import your own** — build a module and **import its ZIP directly** (no repo required).
- **Generate one with AI** — paste the self-contained prompt in **[Building modules](docs/MODULES-AUTHORING.md)**
  into any AI agent, describe what you want, and import the result.

See **[docs/MODULES-AUTHORING.md](docs/MODULES-AUTHORING.md)** for the full contract, the permission list and
etiquette, the testing process, and the AI prompt. *(The module framework is in active development — see the
[roadmap](docs/ROADMAP.md).)*

---

## Running on a server (advanced / optional)

The app is a standard Next.js server and can run on a Linux VPS:

```bash
npm ci
npm run db:migrate      # apply the database schema
npm run build
npm run start           # serves on port 3000
```

- Run it under a process manager (systemd/pm2). **HTTPS, two options:** enable JonDash's **built-in TLS**
  (automatic Let's Encrypt or bring-your-own, under Admin → Network & HTTPS — no reverse proxy needed),
  **or** put **nginx / Caddy in front** proxying to `127.0.0.1:3000`. Either way, when served over HTTPS
  the app automatically switches cookies to Secure and enables HSTS — no setting to flip.
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
  welcome/          first-run wizard: create the first admin (or restore a backup)
  login/            two-step login (password → authenticator code)
  setup/[token]/    a user completes their account from an invite link
  (app)/dashboard/  user service grid; (app)/account/ self-service
  admin/            Settings area: users, service-groups, sessions, audit, backup,
                    updates, network, email, access-roles, server power
  api/              icons, backup export, update apply/status, server restart/shutdown, health
lib/
  auth/             password, totp, session, preauth, guards, bootstrap, permissions (RBAC)
  security/         csrf, upload processing, rate limit
  tls/              HTTPS / ACME (Let's Encrypt or bring-your-own cert)
  email/            outgoing SMTP / OAuth2
  backup.ts         full server backup + selective restore
  config.ts crypto.ts db.ts settings.ts request.ts audit.ts icons.ts update*.ts server-control.ts
prisma/             schema, migrations
scripts/            launcher supervisor, updater, rollback, redacted logs
server.mjs          custom server (plain HTTP, or terminates TLS)
proxy.ts            security headers + auth gate
start-dashboard.bat one-click launcher (Windows)
```

## License

**Personal-use** — see [LICENSE](LICENSE). Free to use for your own **personal, non-commercial** purposes;
no selling, no redistribution. You may build your own add-on modules — and if you share one, publish it in
your own public repository and let the author know via GitHub so it can be linked.
