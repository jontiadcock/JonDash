# JonDash

**[Features](#features) · [Quick start](#quick-start-windows) · [Using it](#using-it) · [Modules & helpers](#modules--helpers) · [Server install](#running-on-a-server) · [Security](#security) · [Changelog](CHANGELOG.md) · [Roadmap](docs/ROADMAP.md)**

A self-hosted, login-protected dashboard. Each person signs in and sees a personal grid of service tiles
(icon + name → link). You (the admin) decide what each user sees, and everything is managed in the web
interface — **no coding or file editing required.**

- **Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Prisma + SQLite
- **Sign-in:** password **+ authenticator-app code (two-factor)**
- **Updates:** in-app, on a **Stable** or **Beta** channel — see [CHANGELOG.md](CHANGELOG.md)

## The JonDash project

| Repository | What it is |
| ---------- | ---------- |
| **[JonDash](https://github.com/jontiadcock/JonDash)** *(you are here)* | The dashboard itself — the app you install and run. |
| **[JonDash-addons](https://github.com/jontiadcock/JonDash-addons)** | The official source of add-on **modules** and **helpers**, installed from inside JonDash. |
| **[JonDash-mcp](https://github.com/jontiadcock/JonDash-mcp)** | An [MCP](https://modelcontextprotocol.io) server so an AI assistant can read and manage your instance. |

---

## Features

- **Per-user dashboards** — each person sees only the service tiles you give them.
- **Service Groups** — bundle tiles into a group and assign it to many users at once.
- **Two-factor sign-in** with **backup recovery codes** if you lose your authenticator.
- **Delegated admin** — grant specific admin powers with **Access Roles**, without full admin.
- **Account self-service** — users change their own password and re-enrol their authenticator.
- **Session manager** — view and revoke active sign-ins (device, approximate location).
- **Audit log** and configurable **Settings** (sign-in message, session/idle timeouts, retention).
- **Full server backup & selective restore** — export the whole instance to one file; an encrypted backup
  also carries credentials and keys, so two-factor keeps working after a restore or migration.
- **Optional HTTPS** — automatic Let's Encrypt certificate or bring-your-own, with configurable ports
  (off by default).
- **Outgoing email** — connect an SMTP account (app password or OAuth2), set up in the app.
- **One-click updates** — pick a **Stable** or **Beta** channel and update from inside the app; a
  self-supervising launcher captures crashes, auto-restarts, and **rolls back a failed update**.
- **Restart / shut down** the server from the Settings area.
- **Modules** — install add-ons that add features **without touching the base app**, with app-store-style
  permission consent. See [Modules & helpers](#modules--helpers).
- **Secure by default** and **zero-config** — keys, database, and site address set up on first run.

---

## Quick start (Windows)

1. Install **Node.js** if you don't have it (one-time) — the "LTS" build from <https://nodejs.org>.
2. **Double-click `start-dashboard.bat`.**
3. Your browser opens at **http://localhost:3000**. The first run walks you through creating the
   administrator account: email, password, and scanning a QR code into an authenticator app
   (Google Authenticator, Authy, and similar all work).

Leave the console window open while you use the dashboard; close it to stop. To start again later,
double-click `start-dashboard.bat` again.

> Nothing to configure by hand: the database, security keys, and site address are all set up
> automatically on the first run.

## Using it

**As admin**, the **Settings** area (left sidebar, grouped **General · Server settings · Security**) covers:

- **Users** — create accounts (you get a **one-time setup link** to send to each person), manage each
  user's tiles, assign Service Groups, reset access, disable or delete.
- **Service Groups** and **Access Roles** (delegated-admin capability bundles).
- **Sessions**, **Audit log**, **Modules**, **Helpers**, and **General settings**.
- **Server settings** — Updates, Backup & restore, Network & HTTPS, Email, and Server power
  (restart / shut down).
- Uploading an icon per tile (PNG/JPEG/WebP/GIF).

**As a user**, sign in and click your tiles. From **Account** you can change your password, re-enrol your
authenticator, view recovery codes, and manage your own sessions.

When you create a user, send them the setup link. They open it, choose a password, scan the QR code, save
their recovery codes, and they're in.

---

## Modules & helpers

**Modules** are optional add-ons that plug extra features into JonDash — a dashboard widget, their own
page(s), and their own settings — **without changing the base app**. Disable or remove one and JonDash
behaves exactly as before, like removing an app from a phone.

Before anything is installed you approve what it can do, in plain language: connecting out to other
servers, using your encryption key, writing audit entries, sending email. An **install-time verifier**
refuses code that reaches for a capability it didn't declare, touches the filesystem, builds code at
runtime, reads the server's environment, or reaches into JonDash's internals. That's a strong safety net,
**not a sandbox** — a module still runs with the app's privileges, so only install modules you trust.

Three ways to add one:

- **From a source** — the official [JonDash-addons](https://github.com/jontiadcock/JonDash-addons) source
  is set up for you, and you can add **any public GitHub repo** that publishes modules. Tick several and
  install them in one batch.
- **Import your own** — build a module and **import its ZIP directly**, no repository involved.
- **Generate one with AI** — paste the self-contained prompt from
  [docs/MODULES-AUTHORING.md](docs/MODULES-AUTHORING.md) into any AI agent, describe what you want, and
  import the result.

Modules **update independently of JonDash** under **Admin → Updates**, on their own stable/beta channel.
They are **not** updated automatically unless you tick **Update automatically** on that module — it is
off by default and set per module, never as one global switch, because a single tick would give every
source you have added a standing channel to run new code here. Modules from the official source repair
themselves if a file they need goes missing; anything imported or from elsewhere is reported instead —
JonDash won't fetch code on its behalf.

**Admin → Updates is the one page for everything that updates**: JonDash itself and its channel, the
schedule automatic updates run on (daily, weekly or monthly, at a time you pick), and every module and
helper with its version, channel and its own **Update automatically** tick.

Whatever the schedule says, an update is **never** applied automatically when it asks for more access
than you approved, is blocked, would go backwards a version, or would stop another module working. Those
wait for you, and the run records what it held back and why.

**Helpers** are shared components that give modules a capability they can't have alone (for example,
background work that starts with the server). They come **only from the official source**, arrive
automatically with the module that needs them, and are listed read-only under **Admin → Helpers**, showing
which modules use each. There is nothing to install or remove.

📖 **Building your own:** [docs/MODULES-AUTHORING.md](docs/MODULES-AUTHORING.md) — the full contract,
permission list, testing process, and the AI prompt. Helper design: [docs/HELPERS-DESIGN.md](docs/HELPERS-DESIGN.md).

---

## Running on a server

JonDash is a standard Next.js server and runs on a Linux VPS:

```bash
npm ci
npm run db:migrate      # apply the database schema
npm run build
npm run start           # serves on port 3000
```

- Run it under a process manager (systemd/pm2). **HTTPS, two options:** enable JonDash's **built-in TLS**
  (automatic Let's Encrypt or bring-your-own, under Admin → Network & HTTPS — no reverse proxy needed),
  **or** put **nginx / Caddy in front** proxying to `127.0.0.1:3000`. Either way, when served over HTTPS
  the app switches cookies to Secure and enables HSTS automatically — no setting to flip.
- Forward the real host/scheme/IP (`X-Forwarded-Host` / `X-Forwarded-Proto` / `X-Forwarded-For`) from the
  proxy; nginx and Caddy set these by default.
- **Back up** the `prisma/` database file, `uploads/` (icons), and `.data/` (auto-generated encryption
  key). Losing `.data/` makes stored two-factor secrets unrecoverable, so keep a copy. The in-app
  encrypted backup covers all three.

## Security

- Passwords hashed with **argon2id**; strength policy enforced.
- **Two-factor (TOTP)** required; secrets **encrypted at rest** (AES-256-GCM, key auto-generated into
  `.data/secrets.json`).
- **Sessions:** opaque random tokens stored **hashed**; httpOnly, SameSite=Strict cookies, Secure
  automatically on HTTPS; server-side expiry; revocable.
- **Rate limiting / lockout** on password and two-factor attempts.
- **XSS:** React auto-escaping only; service links restricted to `http`/`https` and opened with
  `rel="noopener noreferrer"`.
- **Uploads (admin only):** type-checked, size-capped, re-encoded to PNG with `sharp` (strips embedded
  payloads), stored outside the web root, served via an authenticated, ownership-checked route with
  `nosniff`.
- **CSRF:** SameSite=Strict cookies + same-origin assertion on every change.
- **Hardened headers** (`proxy.ts`): nonce-based CSP, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy`, HSTS (on HTTPS), `Permissions-Policy`.
- **Authorization** enforced server-side on every protected page, action, and route.
- **Audit log** of sign-in and admin actions.

Latest review: [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md). Report a security problem privately via
[github.com/jontiadcock](https://github.com/jontiadcock) rather than opening a public issue.

## For maintainers

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Development server (relaxed CSP for HMR) |
| `npm run build`      | Production build                         |
| `npm run start`      | Run the production build                 |
| `npm run db:migrate` | Apply database migrations                |
| `npm run typecheck`  | `tsc --noEmit`                           |
| `npm run lint`       | ESLint                                   |
| `npm test`           | Vitest (throwaway SQLite database)       |

Tests aren't in the downloadable ZIP — clone the repo to run them. See
[CONTRIBUTING.md](CONTRIBUTING.md). CI runs typecheck, lint, and tests on Linux and Windows for every push
to `main` and `beta`.

The first admin is created through the `/welcome` wizard in the browser; a command-line alternative
(`npm run db:seed`) exists but isn't needed.

### Project layout

```
app/
  welcome/          first-run wizard: create the first admin (or restore a backup)
  login/            two-step login (password → authenticator code)
  setup/[token]/    a user completes their account from an invite link
  (app)/dashboard/  user service grid; (app)/account/ self-service
  (app)/m/[module]/ catch-all for module-provided pages, served at /m/<id>/…
  admin/            Settings area: users, service-groups, sessions, audit, modules, helpers,
                    backup, updates, network, email, access-roles, server power
  api/              icons, backup export, update apply/status, server restart/shutdown, health
lib/
  auth/             password, totp, session, preauth, guards, bootstrap, permissions (RBAC)
  security/         csrf, upload processing, rate limit
  modules/          install, verify, registry, permissions, migrations, updates, provenance
  helpers/          install, registry, boot phase, reconciliation
  tls/              HTTPS / ACME (Let's Encrypt or bring-your-own cert)
  email/            outgoing SMTP / OAuth2
  backup.ts         full server backup + selective restore
  config.ts crypto.ts db.ts settings.ts request.ts audit.ts icons.ts update*.ts server-control.ts
modules/            installed modules (kept across updates; empty in a fresh install)
helpers/            installed helpers (kept across updates; empty in a fresh install)
prisma/             schema, migrations
scripts/            launcher supervisor, updater, rollback, module recovery, redacted logs
tests/              Vitest unit + integration suites
instrumentation.ts  server-start work (migrations, helper boot phase)
server.mjs          custom server (plain HTTP, or terminates TLS)
proxy.ts            security headers + auth gate
start-dashboard.bat one-click launcher (Windows)
```

### Documentation

| Document | What's in it |
| -------- | ------------ |
| [CHANGELOG.md](CHANGELOG.md) | What changed in every release, both channels |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build queue, feature catalog, known bugs |
| [docs/MODULES-AUTHORING.md](docs/MODULES-AUTHORING.md) | Module contract, permissions, testing, AI prompt |
| [docs/HELPERS-DESIGN.md](docs/HELPERS-DESIGN.md) | What helpers are and the rules they follow |
| [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) | Security review and test report |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Running the test suite, CI |

## License

**Personal-use** — see [LICENSE](LICENSE). Free for your own **personal, non-commercial** use; no selling,
no redistribution. You may build your own add-on modules — if you share one, publish it in your own public
repository and let the author know via GitHub so it can be linked.
