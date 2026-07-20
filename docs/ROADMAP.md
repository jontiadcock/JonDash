# JonDash — Roadmap

> Living planning doc. Nothing here is built until agreed; nothing is pushed until
> approved (per the workflow rules). Each release is version-tagged at push time.

## How to read this roadmap

- **Stable IDs.** Every item has a permanent ID (`SEC-03`, `MOD-01`, …). An ID never
  changes even if priority does, so it's always safe to reference. Categories:
  - **SEC** — security & access control
  - **MOD** — modules & customization platform
  - **OPS** — platform, packaging & operations
  - **CORE** — core app & UX
  - **BUG** — known bugs (tracked in the **Bugs / known issues** section, by severity)
- **Status:** ✅ Shipped · 🔨 Built (unpublished) · ▶️ In progress · ⏳ Planned · 🧊 Backlog · 🌅 Someday
- **Bug severity:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low
- **Views:** the **Build queue** is the single source of feature *priority order*; the
  **Catalog** holds per-feature detail by category; **Bugs / known issues** tracks defects by severity.
- **Standardize on every edit:** a new item gets the next free ID in its category and is
  slotted into the build queue by priority. Keep one canonical entry per item (don't
  re-describe it in multiple places). Don't change existing priorities without the user.

## Vision

JonDash grows from a per-user/role services dashboard into a **modular, security-first
platform**: a lean core plus installable **modules/addons** (integrations and live-data
widgets), self-service account management over email, and strong access controls
(delegated admin, IP/country policies, trusted-IP auto-login). Long term, **third parties
can author their own addons**.

- **Scope now:** built for the **owner's own use** (single operator). Broad multi-user /
  public readiness (Docker, scale, i18n, legal) is a later goal — not over-engineered for yet.
- **Deployment end-state:** package everything as a **bootable VHD appliance** for a
  hypervisor. Big convert for later; for now the basis is **Windows** (`start-dashboard.bat`).

---

## Build queue (priority order — do not reorder without the user)

Built one at a time, each via the per-item workflow (plan → preview → review → implement →
self-test → hand off → cleanup). Each ships only after test → confirm → approval → tagged push.

**Now**
- _Nothing actively in progress. **Next targeted for a beta: OPS-10** (launcher supervisor +
  auto-backup/revert — must fix **BUG-10** crash-detection first). Next security feature: **SEC-03**._

**Next — security & access control**
1. ⏳ **SEC-03 — Country allow / deny (GeoIP)**
2. ⏳ **SEC-04 — Session lifecycle hardening**
3. ⏳ **SEC-05 — Trusted-IP auto-login**

**Then — modules & customization platform**
5. ⏳ **MOD-01 — Module / feature framework**
6. ⏳ **MOD-02 — Health monitoring (module, Phase 1: status)**
7. ⏳ **MOD-03 — Health monitoring alerting (Phase 2)** — needs OPS-02
8. ⏳ **MOD-04 — Live widgets + arrangeable layout**
9. ⏳ **MOD-05 — Official Addons page**

**Planned — slot in as decided (not tied to the sequence above)**
- ⏳ **OPS-02 — Email + self-service password reset** — part 1 (email) shipped v1.2.5; part 2 (emailed setup/reset links + self-service reset) unlocks MOD-03
- ⏳ **CORE-02 — Admin → "Settings" left-sidebar redesign** — grouped Server / Security sections, General on top
- ⏳ **OPS-07 — Bring-your-own cert: how-to + validate/upload, or OS cert store**
- ⏳ **OPS-08 — Let's Encrypt: process-oriented progress feedback**
- ⏳ **OPS-09 — SMTP provider presets + auth-type clarity**
- ⏳ **OPS-10 — Launcher supervisor: crash capture + auto-backup & revert** — next-beta target; fixes BUG-10 first
- ⏳ **CORE-03 — Better mobile / responsive support**

**Backlog**
- 🧊 **SEC-02 — IP allow / deny** — deprioritised 2026-07-20 (revisit alongside SEC-03/SEC-05, which share the trusted-proxy XFF prereq)
- 🧊 **CORE-01 — "No / low recovery codes" reminder**
- 🧊 **OPS-06 — Optional skip of browser auto-open on launch** — reclassified from BUG-06

_(Known bugs are tracked in the **Bugs / known issues** section, by severity.)_

**Someday — big conversions**
- 🌅 **MOD-06 — Third-party addons**
- 🌅 **OPS-03 — VHD appliance**

---

## Catalog

### SEC — Security & access control

#### SEC-01 · Delegated admin permissions (capability RBAC) — ✅ Shipped v1.1.3 (2026-07-19)
Delegate specific admin powers to a normal USER without granting full ADMIN.
- `AccessRole` model (name + capabilities), M-N to users — **parallel to Service Groups**
  (Service Groups = services; Access Roles = admin capabilities). Managed at
  `/admin/access-roles` (ADMIN-only).
- Capabilities: `users.manage`, `users.reset`, `groups.manage`, `sessions.manage`,
  `audit.view`, `settings.manage`, `backups.manage`. Guards `requirePermission(cap)`;
  admin area opens to anyone with ≥1 capability; nav shows only permitted sections.
- **Kept ADMIN-only:** managing/assigning access roles, creating/acting-on ADMIN accounts,
  backup **restore** (export is delegable). Anti-escalation guards throughout. +10 tests.

#### SEC-02 · IP allow / deny — 🧊 Backlog (deprioritised 2026-07-20)
Restrict access to chosen IP/CIDR ranges, blocked before login (proxy-enforced). Mode:
allowlist (default deny) or denylist. Clear "you could lock yourself out" warning.
- **Prereq:** strict trusted-proxy `X-Forwarded-For` parsing — the client IP must come from a
  known reverse proxy or it's spoofable.

#### SEC-03 · Country allow / deny (GeoIP) — ⏳
Allow/block by country of the client IP. External **free** geo-IP API with **automatic
failover** to backup provider(s) + caching. Enforced server-side at the session/login guard.
(Lookups are external, so visitor IPs are sent to the provider; cache + pick privacy-reasonable providers.)

#### SEC-04 · Session lifecycle hardening — ⏳
Token rotation on privilege change (review finding #5). Idle timeout already shipped (v1.0.2).

#### SEC-05 · Trusted-IP auto-login — ⏳ (highest risk — locked policy)
Map an IP/CIDR → an account logged in automatically without credentials (e.g. a LAN kiosk).
- **Off by default for everyone.** **Admin accounts can never be targets** (hard exclusion).
- **Regular users opt in for their own account** with a **recorded, audited disclaimer**.
- **Two-tier warning:** standard for private/LAN; **stronger warning + typed confirmation**
  for any public/external IP.
- **Enforcement:** in session resolution; only the forwarded IP from the known reverse proxy
  is trusted; every auto-login is audit-logged; rules are per-entry enable/disable.

#### Security hardening backlog (from `docs/SECURITY-REVIEW.md`)
Dummy-argon2 on unknown-user login (timing), `poweredByHeader:false`, TOTP replay
prevention, signed-update verification, durable (Redis) rate-limit.

### MOD — Modules & customization platform

#### MOD-01 · Module / feature framework — ⏳
The plumbing that lets features & widgets plug into the core without forking.
- DB-backed registry; a **"Features"** admin tab with on/off switches; a first-run "Do you
  want to enable these features?" prompt; **admin-only** (later gated by a SEC-01 capability).
- **Extension points:** core pages iterate a registry to render registered widgets/panels;
  module pages via one catch-all `/addons/[module]/[...]`. `Module` table (`key`, `name`,
  `version`, `enabled`, `configJson`, `installedAt`).
- **Contract:** a `ModuleDefinition` interface (id, version, minAppVersion, register()
  hooks, settings schema, migrations) — designed from day one for external authors.
- **Install model:** modules ship in-repo (or via auto-update); "install" = enable +
  configure + run migrations. No arbitrary remote code (safest for a security app).

#### MOD-02 · Health monitoring (first module) — Phase 1: status only — ⏳
- Per-service checks: **HTTP(S)** (status + latency) and **TCP port** (raw connect).
  Admin-configured (users don't create tiles).
- **Everything selectable:** enable per tile, check type, refresh interval, timeout, expected
  status/port, and which readouts (status dot, latency, uptime%, last-checked) show on the dashboard.
- **Scheduler:** in-process guarded-singleton poller (`unref`); single-instance.
- **RBAC visibility:** users only see health for tiles they can already see (reuse
  `getUserVisibleLinks`/`canViewLink` — IDOR-safe).
- **SSRF stance:** admin-configured targets; private/LAN IPs *allowed* (self-hosting is the
  point); http/https only, capped redirects, hard timeout, no cookies/credentials, no `file://`.
- **Data:** `ServiceCheck` (config + rolling status) 1:1-optional on `Link`; `CheckResult`
  history + retention prune for uptime%. New tests: check logic + status-visibility IDOR.

#### MOD-03 · Health monitoring alerting — Phase 2 — ⏳ (needs OPS-02)
Outbound **webhook** and/or **SMTP email** on down/up state-change; secrets stored as
encrypted `Setting`s.

#### MOD-04 · Live widgets + arrangeable layout — ⏳
Widgets showing live data (crypto, PC temps, service status) on a dashboard you arrange yourself.

#### MOD-05 · Official Addons page — ⏳
Curated **registry manifest** (JSON, hosted in-repo): `id`, `name`, `description`, `version`,
`minAppVersion`, `category`, `configSchema`, docs URL. Admin Addons page with
Install/Enable/Configure/Disable; incompatible (minAppVersion) addons greyed out.

#### MOD-06 · Third-party addons — 🌅
External authors build & publish their own, behind signing / review / sandboxing. Deferred (v3).

### OPS — Platform, packaging & operations

#### OPS-01 · Shrink install footprint — ✅ Shipped (prune v1.1.4, strip v1.1.7; standalone reverted)
**Phase 1 (v1.1.4):** the launcher builds only when the version changes, then `npm prune
--omit=dev` — node_modules **26,155 → 15,485 files (~41%)**. Config moved to `next.config.mjs`.
**Cruft strip (v1.1.7):** launcher also deletes `*.d.ts` + `*.map` from node_modules and drops
`.next/cache` — **→ ~9,076 files (~65% total)**. Verified all native routes (Prisma/argon2/sharp).
**Phase 2 (`output: "standalone"`) — tried in v1.1.5, REVERTED in v1.1.6.** Got to ~1,732 files
(~93%) but broke at runtime: **Next 16 builds with Turbopack, which references native externals
(sharp, argon2) by a hashed id that fails in the standalone bundle** (Prisma was worked around by
moving its client in-project, but sharp/argon2 can't move). The fix — build with `--webpack` —
fails on Windows with an EPERM on the `Application Data` junction. **Deferred** until a reliable
path exists (Turbopack external fix, the Windows webpack issue, or a Node SEA single binary).
An install is ~26k files, **97.5% `node_modules`**; our own source is ~120 files. Levers:
- **Next.js `output: "standalone"`** — traces only runtime deps (biggest reduction).
- **Drop dev-only deps at runtime** (`npm ci --omit=dev` / prune after build).
- **Ship prebuilt releases** (the standalone build) rather than source-that-each-machine-builds.
- *Interacts with:* auto-update (fetch prebuilt release) and OPS-03 (imaging sidesteps file counts).
- **Standing rule:** avoid adding heavy dependencies casually; keep the runtime footprint in mind.

#### OPS-02 · Email + self-service password reset — ▶️ Part 1 shipped v1.2.5
**Part 1 — SHIPPED v1.2.5 (2026-07-20):** outgoing email service (`nodemailer`)
with authenticated SMTP (app password; Gmail/Outlook/Hotmail/M365 presets) **and OAuth2** for
Google + Microsoft (XOAUTH2, admin-registered OAuth app + consent flow). Encrypted config in the
Settings store; ADMIN-only **Admin → Email** page with a **test-send**. `lib/email/*`.
**Part 2 — planned:** self-service password reset via an emailed one-time token (reuses the
hashed-token + setup-flow machinery); emailed new-user setup links + admin "reset access".
**Unlocks MOD-03 alerting.**

#### OPS-03 · VHD appliance — 🌅
Package everything as a bootable VM image for a hypervisor. Big convert, later.

#### OPS-05 · Automatic HTTPS (ACME / Let's Encrypt) — ✅ Shipped v1.2.3 (2026-07-20)
_Shipped as **in-process ACME** (a custom `server.mjs` replaces `next start`), with configurable
ports and a bring-your-own-cert option; **off by default**. Managed at `/admin/network`
(ADMIN-only). The live Let's Encrypt issuance path awaits confirmation on a real domain (test with
`ACME_STAGING=1` first)._

Serve JonDash over real, browser-trusted TLS instead of plain HTTP, with certificates
**auto-issued and auto-renewed** via the ACME protocol (Let's Encrypt as the default CA).
- **Why:** today the app runs behind `next start` on HTTP; the CSP already gates
  `upgrade-insecure-requests` on HTTPS (v1.0.3), so proper TLS lets that (and secure cookies /
  HSTS) fully engage. Removes the self-signed-cert friction for self-hosters.
- **Approach — decide at design time (two viable paths):**
  1. **Bundled reverse proxy** (e.g. **Caddy**, which does ACME automatically) in front of
     `next start` — least custom code, robust renewal, but adds a component to the Windows launcher.
  2. **In-process ACME** (a Node ACME client, e.g. `acme-client`/Greenlock-style) terminating
     TLS in the app — no extra binary, but we own renewal, key storage, and the HTTPS listener.
- **Challenge type:** **HTTP-01** (needs port 80 reachable) is simplest; **DNS-01** supports
  wildcard + hosts not publicly reachable on 80 but needs DNS-provider API creds. Support HTTP-01
  first; DNS-01 later.
- **Prereqs / constraints:** a **real domain name** pointing at the host and **public
  reachability** (port 80/443) for HTTP-01 — so this is opt-in and won't work for pure-LAN/IP-only
  installs (offer a self-signed / bring-your-own-cert fallback for those). Cert + account keys are
  **sensitive**: store under `.data/` with the same 0600 posture as `secrets.json`, never in logs
  (ties into OPS-04 redaction), never committed.
- **Config:** admin-entered domain + contact email + enable toggle in Settings; show cert status
  (issuer, expiry, last renewal) and surface renewal failures (ties into OPS-04 logging).
- **Interacts with:** OPS-03 (a VHD appliance would ship this pre-wired) and the trusted-proxy
  `X-Forwarded-For` work SEC-02/03/05 need (a reverse proxy makes XFF handling first-class).

#### OPS-04 · Self-healing launcher + verbose logs — ✅ Shipped v1.2.3 (2026-07-20)
Make the launcher recover from a broken/partial install instead of bricking, and give us real
diagnostics.
- **Auto-recovery:** if a startup step (`npm install` / build / start) fails, **clear
  `node_modules` (and `.next`) and retry the launch once** from clean — a corrupt or half-updated
  install self-heals. (The stripped-`.d.ts` build failure would have auto-fixed under this.)
- **Retry guard:** attempt the clean rebuild once, then stop with a clear message — never loop
  forever. Use a marker (e.g. `.data/recovery-attempted`) cleared on a successful start.
- **Alert the user** when a recovery happens: say plainly what failed and that it rebuilt.
- **Verbose action log:** a `logs/` folder recording the launcher/app steps (update checks,
  install/build/start, errors, recoveries) with timestamps, so issues are diagnosable after the fact.
- **No sensitive data:** logs must never contain the encryption key, `.env`/secrets, passwords,
  tokens, session tokens, or DB contents — redact anything sensitive. **Gitignore `logs/`** (never pushed).

#### OPS-06 · Optional skip of browser auto-open on launch — 🧊 Backlog (reclassified from BUG-06, 2026-07-20)
An improvement, not a defect: `start-dashboard.bat` opens the browser on first launch
(`start "" "%DISPLAYURL%"`) with no way to disable it for a headless / remote-server setup. Add an
opt-out the launcher checks before opening — a `.data` flag, a launcher argument, or an env var
(e.g. `JONDASH_NO_BROWSER`).

#### OPS-07 · Bring-your-own certificate: guidance + validate/upload, or OS cert store — ⏳
Make the BYO-cert path (Admin → Network & HTTPS) friendlier and safer to configure. Extends OPS-05.
- **Brief how-to inline on the page** — what the certificate + private key (PEM) are, where to get
  them, and exactly which field is which (leaf + chain, and the key), with a link to fuller docs.
- **Upload + validate before applying** — let the admin **upload** the cert/key files (not only
  point at a path), then **confirm the pair is usable**: parse the PEM, check the private key matches
  the certificate, and surface issuer, subject/SANs and validity dates (warn on expired /
  not-yet-valid / self-signed). `lib/tls/network.ts` already `createSecureContext`-validates a BYO
  cert (pass/fail); extend it to report these details back to the UI.
- **Optional — pick from the OS personal certificate store** (Windows "Personal"/`My`) if feasible:
  enumerate installed certs that have a private key and let the admin select one instead of PEM
  files. Node has no first-class cert-store access, so **spike feasibility first** (a PowerShell /
  `certutil` bridge, or a native module) before committing.
- Keep the 0600 posture for any uploaded key material and never log it (OPS-04 redaction).

#### OPS-08 · Let's Encrypt: process-oriented progress feedback — ⏳
Today enabling Let's Encrypt saves the config and issuance happens on the next restart, with only a
status panel to poll. Make it feel like a **guided process**: a step-by-step progress UI during
issuance — e.g. "Saving configuration → Requesting certificate → Answering the HTTP-01 challenge →
Certificate issued → Switching to HTTPS" — with a "this can take a minute" note, working/among-steps
indicators, and a clear success/failure end state that surfaces the ACME error text on failure.
Drive it off the ACME lifecycle already in `lib/tls/acme.mjs` + the cert-status state; likely needs a
small progress/status endpoint the Network page polls. Pairs with OPS-07 (both polish the Network &
HTTPS page).

#### OPS-09 · SMTP provider presets + auth-type clarity — ⏳
Broaden and clarify the email setup page (Admin → Email). Extends OPS-02.
- **More provider presets** — add **SMTP2GO** and a few **free / open-friendly** email/SMTP services,
  each with a short label and a **link** to where the user signs up or gets credentials, plus a clear
  "bring your own SMTP" custom option.
- **Clarify the auth type** — it is **not always an "app password."** Some providers use the normal
  account password, some issue a dedicated SMTP username + API key/token, and Gmail/Outlook require an
  app password (needs 2FA). Relabel/hint the credential field per preset so it's obvious which one to
  enter, and drop the blanket "app password" wording where it's inaccurate.
- Credentials stay encrypted at rest (unchanged).

#### OPS-10 · Launcher supervisor: crash capture + auto-backup & revert — ⏳ (targeted: next beta)
The "next 2 things for a beta," built on a proper launcher **supervisor** (which also fixes BUG-10):
1. **Auto-backup before an update** — snapshot the current, known-good install (the code the updater
   is about to overwrite — not user data, which is already preserved) so there's always a last-good
   package to fall back to.
2. **Auto-revert on a failed update / crash** — if the newly-installed version **fails to start or
   crashes on boot**, the supervisor restores the backed-up last-good package and relaunches instead
   of leaving the server down. **Marker-guarded** (revert once, then stop with a clear message — no
   loop), mirroring OPS-04's recovery guard.
- **Foundation — fix first (BUG-10):** make a **supervisor** the launcher's first action. It spawns
  `server.mjs`, **tees the server's stdout/stderr + exit code into `logs/`** (so a *runtime* crash is
  actually captured — today it isn't), detects an unexpected exit to trigger revert/restart, and
  **exits cleanly when the server is stopped or the console window is closed** (Windows CTRL_CLOSE).
  Real crash detection is the prerequisite for "revert on crash" to work at all.
- **Design notes:** the current updater (`scripts/update.mjs`) copies over in place with **no rollback
  point** — OPS-10 adds the pre-update snapshot + restore. Keep the snapshot lightweight (exclude
  `node_modules`/`.next`/user data, which regenerate or are preserved). Ties into OPS-04 (self-heal)
  and the auto-update flow. **A launcher change carries brick-risk — plan + review before building.**

### CORE — Core app & UX

#### CORE-01 · "No / low recovery codes" reminder — 🧊 Backlog
Nudge accounts that have no (or few) backup codes to generate a set; closes the gap for
accounts created before v1.0.1. Pushed back 2026-07-19; low urgency.

#### CORE-02 · Admin area → "Settings" with a left sidebar + grouped sections — ▶️ Shipped v1.3.3-beta.1 (beta)
Restructure the admin navigation and information architecture (a UI/IA change — no new capabilities).
**Shipped v1.3.3-beta.1:** desktop left sidebar (`app/admin/admin-sidebar.tsx`) titled "Settings" with
**General** on top, **Server settings** (Updates, Backup, Network & HTTPS, Email) and **Security**
(Users, Service Groups, Sessions, Audit, Access Roles); Updates moved to its own `/admin/updates` page
(off the General/Settings page); capability-gating preserved (empty groups dropped); the mobile view
keeps the "Menu ▾" dropdown (sidebar is `md`+ only). Verified at desktop + 375px. Original spec below:
- **Move the nav to a left sidebar** (from today's top "Menu ▾" dropdown, `app/admin/admin-nav.tsx`)
  and **rename the "Admin" area to "Settings."**
- **"General" as the top item** (standalone, first) — the current Settings page (sign-in message etc.).
- **Group the rest into sub-categories:**
  - **Server settings** — Updates (moved here from its current spot), Backup, Network & HTTPS, Email.
  - **Security** — Audit log, Sessions, Users, Service Groups (and Access Roles).
- **Preserve capability-gating:** a delegate still sees only the sections their Access Role permits
  (`ADMIN_SECTIONS` / `allowedSections`), now rendered grouped in the sidebar; full-admin-only
  sections (Network, Email, Access Roles) stay ADMIN-only. Landing page = `firstPermittedAdminPath`.

#### CORE-03 · Better mobile / responsive support — ▶️ In progress (v1.3.2-beta.1 polish user-confirmed 2026-07-21)
The app was usable on mobile but not great; the **v1.3.2-beta.1** responsive polish was **tested and
confirmed by the user 2026-07-21 ("significantly better")**.
**v1.3.2-beta.1 (beta):** the header decrowds on small screens — the version tag and long labels
("Admin", "My") collapse and the brand truncates (`min-w-0` + `flex-none`) so it can't scroll
sideways — plus tighter mobile spacing; wide admin tables already scroll within their wrapper.
The larger structural win still comes with **CORE-02** (admin → "Settings" sidebar). Remaining:
forms, tap-target sizes, and a per-page audit at mobile widths. Presentation only, no functionality change.

---

## Testing required

Features that have shipped but are **not yet confirmed by manual testing**. An item is added here
after each push (unless self-testing 100%-guaranteed it) and removed once the user confirms it works.
Detailed step-by-step test notes for each item are kept privately in `PROJECT_MEMORY.md` — ask to see them.

- **Admin-issued setup links** — create a user, open the `/setup/<token>` link, set password + TOTP; confirm one-time use + 7-day expiry.
- **Settings take effect** — session lifetime, idle timeout, and audit-log retention: set each and confirm the behaviour (re-login after lifetime, auto-logout after idle, old audit rows pruned).
- **Check-for-updates button** (v1.3.0) — Settings → Updates: force a check; confirm "up to date" vs an available release + Update-now.
- **Email send** (OPS-02, v1.2.5) — send a test email via app-password SMTP **and** via Google/Microsoft OAuth2 (the OAuth2 option is under the Authentication dropdown).
- **HTTPS / networking** (OPS-05, v1.2.3) — Let's Encrypt live cert (`ACME_STAGING=1` first), bring-your-own-cert, configurable ports, the Network page; sign in / authenticator / icon-upload over HTTPS.
- **Self-healing launcher + logs** (OPS-04, v1.2.3) — force a failed build; confirm it wipes + retries once (no loop), alerts, and writes a redacted `logs/` trail.
- **Hardened security spot-check** — nonce CSP, CSRF same-origin rejection, brute-force/rate-limit lockout, and security headers behave as expected.
- **Smoother page transitions** (v1.3.1-beta.1) — content fades in on navigation across the app and admin areas; confirm it's subtle, the header/nav don't flicker, there's no layout shift, and it's disabled under reduced-motion.
- **Settings sidebar redesign** (CORE-02, v1.3.3-beta.1) — the new desktop left "Settings" nav (General / Server settings / Security) + the moved `/admin/updates` page; eyeball the look, confirm every link works, a delegate sees only their permitted sections, and the mobile "Menu ▾" dropdown still works.
- **Update auto-reload** (BUG-12, v1.3.3-beta.1) — on a **real** update, confirm the page now returns to the login screen after the restart instead of hanging on "reconnecting…" (code path verified; needs a live update+restart to fully confirm).
- **Batch fixes — verified live, worth a glance** (v1.3.3-beta.1) — network Off-mode save (BUG-05), channel display updates immediately on save (BUG-09), and the mobile service-edit form no longer overflows (BUG-13).

---

## Bugs / known issues

Tracked separately from features. Ordered by severity (🔴 Critical → 🟢 Low); fix priority
follows severity unless one is actively blocking. Reproduce → fix → add a regression test where
practical. Stable `BUG-##` IDs.

### 🔴 Critical
_None currently._

### 🟠 High
- **BUG-04 · Restoring a backup breaks the authenticator (TOTP) — backup codes still work.** After a
  restore, users can't sign in with their authenticator app, but their one-time backup codes do.
  **Cause:** TOTP secrets are stored **encrypted** (`totpSecretEnc`) with the per-install AES key in
  `.data/secrets.json`, which is **not** in the backup — so a different install decrypts them with a
  different key and verification fails. Backup codes are SHA-256 hashes (no decryption), so they
  survive. This directly undermines the v1.3.0 migration / first-run restore. **Workaround:** sign in
  with a backup code, then re-enrol the authenticator (Account page). **Fix:** carry TOTP secrets
  across installs — e.g. on an encrypted backup, wrap the TOTP secrets with the passphrase (not the
  install key) and re-encrypt to the destination key on restore. Logged 2026-07-20.
- **BUG-10 · Launcher self-heal doesn't recover a *running* server crash — only a failed build.** The
  OPS-04 self-healing (v1.2.3) recovers when the install/**build** step fails, but once `server.mjs`
  has started the launcher has handed off and nothing supervises it: if the running server crashes,
  the cause isn't captured in `logs/` (so the logs are "useless" for diagnosis) and the server just
  **stays down**. **Design direction (per the user):** the launcher's first action should be to start
  a **supervisor/monitor** that owns the server lifecycle — spawns the server, captures its
  stdout/stderr + exit code to the log, restarts or **reverts** on an unexpected crash (see OPS-10),
  and **exits cleanly when the server is stopped or the terminal window (X) is closed** (Windows
  CTRL_CLOSE). Must be fixed before OPS-10's auto-revert can rely on crash detection. Logged 2026-07-21.

### 🟡 Medium
- **BUG-07 · Launcher has no "already running" guard.** Nothing stops `start-dashboard.bat` being run
  a second time. The second instance fails to bind the port (EADDRINUSE) and — worse — OPS-04's
  self-healing may then wipe `node_modules`/`.next` and rebuild, disrupting the instance that's already
  running. **Fix:** a single-instance guard at launch — e.g. a `.data/launcher.lock` (PID + staleness
  check) or a "is the configured port already listening?" probe — and exit with a clear "JonDash is
  already running" message instead of proceeding. Logged 2026-07-20.

### 🟢 Low
_None currently._

_(BUG-08 "Email OAuth2 option isn't discoverable" was removed 2026-07-20 — the option does exist
behind the Authentication dropdown, judged not a defect. BUG-06 "skip browser auto-open" was
reclassified as an improvement → **OPS-06** in the catalog.)_

### ✅ Fixed
- **BUG-01 (High) · Backup silently omitted icons — fixed v1.2.4.** Backups are now a **compressed
  ZIP archive** (`backup.json` + real `icons/` image files); an icons-only export includes every
  referenced icon regardless of which other categories are selected; restore takes the archive, and
  legacy `.json` backups still restore. `lib/backup.ts` + `fflate`; passphrase encryption retained.
- **BUG-02 (Medium) · Icon upload / restore over ~1 MB crashed — fixed v1.2.4.** Raised the Server
  Actions `bodySizeLimit` to `10mb` and added client-side size pre-checks with a friendly message
  (icon uploads and backup restore), so an oversized file no longer triggers an unhandled 413 crash.
- **BUG-05 (Medium) · Network page rejected a valid port in Off mode — fixed v1.3.3-beta.1.**
  `parseAndSaveNetworkConfig` (`lib/tls/network.ts`) now coalesces a missing/blank port from the
  existing config before validating, so an Off-mode save (which hides the HTTPS-port field) succeeds
  instead of coercing `""` → 0. Verified live: Off-mode save returns "Saved — restart to apply."
- **BUG-09 (Low) · Update-channel toggle showed the old channel until refresh — fixed v1.3.3-beta.1.**
  `saveUpdateChannelAction` returns the saved channel and the panel shows it immediately. Verified live.
- **BUG-11 (Low) · Old "website-custom" name in package metadata — fixed v1.3.3-beta.1.** Renamed to
  `jondash` in `package.json` + `package-lock.json` (npm banners now read `jondash@…`).
- **BUG-12 (Medium) · "Update now" never auto-reloaded — fixed v1.3.3-beta.1.** The reload poll
  (`update-banner.tsx` + `settings/updates-panel.tsx`) now treats *any* response as "server's back"
  once it has first seen it go down, then navigates to `/login` (the restart ends the session), instead
  of waiting for a 2xx that never comes (the endpoint 403s post sign-out). Code path verified; the full
  update+restart cycle still wants a live confirmation.
- **BUG-13 (Medium) · Editing a personal service overflowed on mobile — fixed v1.3.3-beta.1.** The edit
  form was wedged into the horizontal controls row; `link-list.tsx` now renders it full-width **below**
  the row (per-row client state; `EditLinkForm` → `EditLinkFields`). Verified: no page overflow at 375px
  with the form open. Logged + fixed 2026-07-21.

### ⛔ Won't fix (upstream)
- **BUG-03 (Low) · `Buffer()` deprecation warning (DEP0005).** Confirmed **not JonDash code** — it's
  emitted by third-party/build tooling (eslint/vite/next/prisma/convert-source-map) and no longer
  appears at runtime under `server.mjs`. Harmless; nothing for us to change. Closed 2026-07-20.

---

## Shipped log

- **v1.0.0** (2026-07-18) — initial release: per-user dashboard, password + TOTP MFA, Service
  Groups, hardened-by-default security.
- **v1.0.1** (2026-07-18) — 2FA backup codes, session manager (coarse geo), backup/restore
  (step-up-gated), step-up auth (`totpVerifiedAt`).
- **v1.0.2** (2026-07-19) — audit-log viewer, account self-service, settings store; Roles →
  **Service Groups**; single Menu dropdown; in-page confirm modals; recovery-codes reveal page.
- **v1.0.3** (2026-07-19) — LAN access fix (CSP `upgrade-insecure-requests` only over HTTPS).
- **v1.1.0** (2026-07-19) — public, source-available release + credential-free auto-update.
- **v1.1.1** (2026-07-19) — installed version shown in the admin header.
- **v1.1.2** (2026-07-19) — automated test + CI suite (Vitest, 46 tests; dev-only, excluded from download).
- **v1.1.3** (2026-07-19) — delegated admin permissions (Access Roles); session + audit settings moved to their own pages; delegate admin-link fix.
- **v1.1.4** (2026-07-19) — OPS-01 Phase 1: prune build-only packages after build (~41% fewer node_modules files); `next.config.ts` → `.mjs`; version-gated rebuild.
- **v1.1.5** (2026-07-19) — OPS-01 Phase 2 (standalone) — **broken, superseded by v1.1.6.** Native externals failed to load at runtime under Turbopack.
- **v1.1.6** (2026-07-19) — reverted v1.1.5 back to the working Phase 1 install model; standalone deferred.
- **v1.1.7** (2026-07-19) — OPS-01 cruft strip: also remove `*.d.ts` + `*.map` + `.next/cache` after build (~26k → ~9k files, ~65% total).
- **v1.2.0** (2026-07-20) — sessions invalidated on server restart (`SERVER_BOOT_TIME` check in `getSessionUser`); everyone re-logs-in after a restart.
- **v1.2.1** (2026-07-20) — fix: per-machine build skips type-check/lint (which the v1.1.7 `.d.ts` strip broke); `next.config` `ignoreBuildErrors` + `ignoreDuringBuilds`.
- **v1.2.2** (2026-07-20) — removed the unsupported `eslint` key from `next.config` (Next 16 dropped it) that printed a harmless startup warning; no functional change.
- **v1.2.3** (2026-07-20) — **OPS-04** self-healing launcher (recover-once from a failed build + redacted `logs/`) **and OPS-05** optional in-process HTTPS (Let's Encrypt HTTP-01 or bring-your-own cert, configurable ports, `/admin/network`, `node server.mjs` custom server); HTTPS off by default.
- **v1.2.4** (2026-07-20) — bug fixes: **BUG-01** backups are now a compressed ZIP archive with real icon files (icons-only export no longer empty; legacy `.json` still restores); **BUG-02** >1 MB icon uploads / restores no longer crash (Server Actions `bodySizeLimit` 10 MB + friendly client size checks). BUG-03 closed as upstream/harmless.
- **v1.2.5** (2026-07-20) — OPS-02 part 1: outgoing email (authenticated SMTP app-password + Google/Microsoft OAuth2), encrypted config, ADMIN-only Email page + test-send.
- **v1.3.0** (2026-07-20) — **update channels (Stable / Beta)** + a Check-for-updates button (`Admin → Settings → Updates`; beta uses `X.Y.Z-beta.N`, channel per branch) — the beta auto-update-channel capability that unblocks the two-branch workflow; **and first-run backup restore** on the welcome screen (initialise a fresh install from a backup; gated to before the first admin exists).

---

## Locked decisions

1. **Addons:** curated/bundled to start; third-party author-created addons are a goal (v3),
   with the contract designed for that now.
2. **GeoIP:** external **free** geo-IP API, with **automatic failover** to backup provider(s).
3. **Trusted-IP auto-login:** off by default for everyone; **admins never** eligible as
   targets; users opt in with a recorded disclaimer; external IPs need the stronger warning + typed confirmation.
4. **Addon manifest:** hosted in-repo.
5. **First audience:** owner only for now; public/multi-user hardening deferred.
6. **Third-party addon code:** wanted eventually, but deferred; keep addons curated/declarative for now.
7. **Deployment:** current basis is the Windows launcher; eventual target is a bootable VHD appliance.
