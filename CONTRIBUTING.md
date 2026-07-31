# Contributing

## Commands

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Development server (relaxed CSP for HMR) |
| `npm run build`      | Production build                         |
| `npm run start`      | Run the production build                 |
| `npm run db:migrate` | Apply database migrations                |
| `npm run typecheck`  | `tsc --noEmit`                           |
| `npm run lint`       | ESLint                                   |
| `npm test`           | Vitest (throwaway SQLite database)       |
| `npm run test:modules` | Module/helper install-path tests only  |

The first admin is created through the `/welcome` wizard in the browser; a command-line
alternative (`npm run db:seed`) exists but isn't needed.

## Project layout

```
app/
  welcome/          first-run wizard: create the first admin (or restore a backup)
  login/            two-step login (password → authenticator code)
  setup/[token]/    a user completes their account from an invite link
  (app)/dashboard/  user service grid; (app)/account/ self-service
  (app)/m/[module]/ catch-all for module-provided pages, served at /m/<id>/…
  admin/            Settings area: users, service-groups, sessions, audit, addons (modules +
                    helpers), permissions, backup, updates, network, email, access-roles,
                    server power   (admin/helpers is a redirect to admin/modules)
  api/              icons, backup export, update apply/status, server restart/shutdown,
                    health, branding
lib/
  auth/             password, totp, session, preauth, guards, bootstrap, permissions (RBAC)
  security/         csrf, upload processing, rate limit
  modules/          install, verify, registry, permissions, migrations, updates, provenance
  helpers/          install, registry, boot phase, reconciliation
  tls/              HTTPS / ACME (Let's Encrypt or bring-your-own cert)
  email/            outgoing SMTP / OAuth2
  validation/       shared input validation
  backup.ts         full server backup + selective restore
  elevation.ts      the only path to privileged OS work — calls the signed helpers in bin/
  permissions-view.ts  the data behind Admin → Permissions (both axes, from one read)
  config.ts crypto.ts db.ts settings.ts request.ts audit.ts icons.ts styles.ts update*.ts
  server-control.ts uninstall-questions.ts
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

## Running the test suite

The automated tests are **not included in the downloadable ZIP** — the download
is kept lean for people who just want to run JonDash. The tests live in the
repository, so grab them by cloning:

```bash
git clone https://github.com/jontiadcock/JonDash.git
cd JonDash
npm install
npm test
```

- Tests run on **Vitest** against a throwaway SQLite database that is created,
  migrated, and deleted automatically for each run — your real `dev.db` is never touched.
- `npm run test:watch` re-runs on change.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, and tests on **Linux and
  Windows** for every push to `main` or `beta`, and every pull request. Both
  platforms are checked because JonDash is a Windows app whose launcher behaviour
  Linux can't exercise, while Linux catches case-sensitivity assumptions Windows hides.

Tests cover the security-critical behaviour — password/2FA, CSRF, RBAC and IDOR
authorization, step-up re-authentication, login rate-limiting and lockout, backup
export/restore (including encryption), backup codes, settings, and the module/helper
install path (archive safety, the install-time verifier, migrations on update) — so
changes that break them fail fast.
