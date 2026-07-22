# JonDash — Roadmap

> Living planning doc. Nothing here is built until agreed; nothing is pushed until
> approved (per the workflow rules). Each release is version-tagged at push time.

## How to read this roadmap

- **Stable IDs.** Every item has a permanent ID (`SEC-04`, `MOD-01`, …). An ID never
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
- ✅ **MOD-01 — Module framework** — **P1–P3 shipped (v1.4.0-beta.1 → beta.6).**
  Plug-and-play modules, installed + updated from a git source **independently of the base app**,
  **permission-gated** (app-store-style consent) with an **install-time verifier**, bulk install, per-module
  RBAC via Service Groups, and per-user resizable dashboard widgets. Full detail in the MOD-01 catalog entry.
  _(Also shipped: OPS-12 v1.3.7-beta.1, OPS-11 v1.3.6-beta.1.)_ **Next: SEC-04.**

**Next — security & access control**
1. ⏳ **SEC-04 — Session lifecycle hardening**
2. ⏳ **SEC-05 — Trusted-IP auto-login**

**Then — modules & customization platform**
5. ✅ **MOD-01 — Module / feature framework** — P1–P3 shipped through v1.4.0-beta.6; detail in the catalog
6. ▶️ **MOD-02 — Health monitoring (module, Phase 1: status)** — built + published by the add-ons session
   (`health-monitor/v0.0.1-beta.1`, beta channel); install verified end to end
7. ⏳ **MOD-03 — Health monitoring alerting (Phase 2)** — needs OPS-02
8. ⏳ **MOD-04 — Live widgets + arrangeable layout**
9. ⏳ **MOD-05 — Official Addons page**

**Planned — slot in as decided (not tied to the sequence above)**
- ⏳ **OPS-02 — Email + self-service password reset** — part 1 (email) shipped v1.2.5; part 2 (emailed setup/reset links + self-service reset) unlocks MOD-03
- ⏳ **CORE-02 — Admin → "Settings" left-sidebar redesign** — grouped Server / Security sections, General on top
- ⏳ **OPS-07 — Bring-your-own cert: how-to + validate/upload, or OS cert store**
- ⏳ **OPS-08 — Let's Encrypt: process-oriented progress feedback**
- ✅ **OPS-10 — Launcher supervisor: crash capture + auto-backup & revert** — shipped v1.3.5-beta.1 (fixed BUG-10; added the auto-install-updates checkbox)
- ✅ **OPS-11 — Update grace screen + Server power (restart/shutdown) + full sign-out on restart** — shipped v1.3.6-beta.1 (follow-on to OPS-10; `/api/health` probe, `ServerWaitOverlay`, `/admin/server`, pre-auth cookie tied to `SERVER_BOOT_TIME`)
- ✅ **OPS-12 — Full server backup + selective restore (+ BUG-04 TOTP fix)** — shipped v1.3.7-beta.1. Export is always full (all tables + whole settings table + `.data` config + master key + icons; sensitive only in an encrypted, strong-passphrase backup); restore is selective and adopts the backup's key so TOTP/email survive migration. `lib/backup.ts` v3, `lib/config-backup.ts`, `validateBackupPassphrase`. Fixes BUG-04.

**Backlog**
- 🧊 **SEC-02 — IP allow / deny** — deprioritised 2026-07-20 (revisit alongside SEC-05, which shares the trusted-proxy XFF prereq)
- 🧊 **CORE-01 — "No / low recovery codes" reminder**
- 🧊 **OPS-06 — Optional skip of browser auto-open on launch** — reclassified from BUG-06

_(Known bugs are tracked in the **Bugs / known issues** section, by severity.)_

**Someday — big conversions**
- 🌅 **MOD-06 — Third-party addons**
- 🌅 **MOD-07 — Modifications (core-modifying add-ons)** — reserved; module framework must allow adding it later
- 🌅 **OPS-03 — VHD appliance**

_Retired (owner decision 2026-07-21): **SEC-03** (Country allow / deny, GeoIP) and **OPS-09** (SMTP
provider presets + auth-type clarity) were dropped — their IDs are retired, not reused. **CORE-03**
(mobile / responsive support) moved to **Ongoing maintenance** below._

---

## Ongoing maintenance

Continuous quality work — handled as part of normal development, not scheduled as build-queue
milestones (no feature ID).

- **Mobile / responsive support** (moved from CORE-03, 2026-07-21) — keep the app usable and tidy at
  phone/tablet widths as features ship: sanity-check new pages/forms at ~375px, sensible tap targets,
  wide tables scroll within their wrapper, the header doesn't crowd or scroll sideways. Baseline is the
  v1.3.2-beta.1 header/spacing polish (user-confirmed "significantly better" 2026-07-21); treat
  regressions as bugs.

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
- **v1.3.4-beta.1:** capability set grown to **9** — added `network.manage` + `email.manage` so the
  new Network & HTTPS and Email admin areas are delegable (they were incidentally ADMIN-only), and
  `settings.manage` now also covers the Updates page. Standing rule: keep `PERMISSIONS`/`ADMIN_SECTIONS`
  in sync with the admin surface as sections are added.

#### SEC-02 · IP allow / deny — 🧊 Backlog (deprioritised 2026-07-20)
Restrict access to chosen IP/CIDR ranges, blocked before login (proxy-enforced). Mode:
allowlist (default deny) or denylist. Clear "you could lock yourself out" warning.
- **Prereq:** strict trusted-proxy `X-Forwarded-For` parsing — the client IP must come from a
  known reverse proxy or it's spoofable.

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

#### MOD-01 · Module framework — ▶️ In progress (Phase 1 shipped v1.4.0-beta.1; P2 next)
Plug-and-play **modules** that plug into the core with a hard **isolation guarantee** (the baseline app is
never affected — "remove the app, the phone is fine"), **installed & updated over public git independently
of the base app**, and **permission-gated** at install. Full design in the **[[jondash-module-framework]]**
memory; authored per the approved plan. Key points:
- **Isolation:** the core **never imports a module** — only a build-time **generated registry**
  (`scripts/gen-modules.mjs` scans a gitignored, update-preserved `modules/` dir). Zero modules ⇒ the app is
  its current self. Enable/disable = instant DB flag; install/update/uninstall = fetch/delete + rebuild +
  restart (reuse OPS-11 grace screen; launcher rebuilds on module-set/version change).
- **Contract:** `modules/<id>/module.ts` exports a `ModuleDefinition` (id, name, version, minAppVersion,
  **permissions[]**, settings schema, `DashboardWidget?`/`Page?`/`SettingsPanel?`, SQL `migrations?`, lifecycle
  hooks). `Module` + `ModuleRecord` + `ModuleMigration` core tables.
- **Data (hybrid):** settings via the existing Setting store (`scope=module`, encrypted secrets, auto-form);
  a generic per-module KV/JSON store; **bespoke tables via module-carried raw-SQL migrations** namespaced
  `mod_<id>_*` (a scoped raw-SQL helper, not the core Prisma client — enables independent updates).
- **Permissions & consent:** manifest declares needs — as shipped the taxonomy is exactly
  **`network:outbound`, `crypto:use`, `audit:write`, `email:send`** (v1.4.0-beta.11 removed the nine that
  were declared but never wired to a capability, so a consent screen can't overstate; each returns with the
  capability that implements it). Install/enable shows a plain-language **permission warning screen**; grants
  stored on the `Module` row; the framework hands each module a **capability-scoped `ModuleContext`** exposing
  only what was granted. *Honest limit:* in-process modules aren't hard-sandboxed
  (consent + scoped context for **curated** modules; real sandboxing for untrusted third-party = MOD-06).
- **Sources + sideload:** a module **source** = a public git repo with a manifest. Default = an official
  **`JonDash-addons`** repo (added by default, **removable/toggleable**); admin can **add any repo by URL**
  then pick a module to install. Each module has its **own version/manifest** — updates without a base update.
  The admin can **also import their own module package** (sideload a ZIP — **no repo/app-store required**;
  permission-consented like any install). Build-your-own is documented with a paste-in **AI-agent prompt**.
- **Extension points (v1):** settings panel (in a new **Modules** settings group), dashboard widget, and
  own pages via one catch-all `/m/<id>/…`. Auth reused via guards + a new **`modules.manage`** capability.
- **Deliverable — 3rd-party author guide:** a public `docs/MODULES-AUTHORING.md` covering the contract,
  **permission list + etiquette**, versioning **cadence**, and **how to structure a module repo** to the
  framework's requirements. Plus each module carries a self-cleaning `modules/<id>/MODULE.md`.
- **Phasing:** **P1 ✅ shipped v1.4.0-beta.1** — framework core + a bundled `sample`
  module (**since removed** — a real module now exists; upgrading installs auto-prune its leftovers):
  `lib/modules/*` (types, registry, store, migrate, context, permissions, manage),
  `Module`/`ModuleRecord`/`ModuleMigration` tables, enable/disable/uninstall, settings + generic store +
  raw-SQL `mod_<id>_*` migrations, permission consent + capability-scoped context, `modules.manage`
  capability, admin **Modules** page (`/admin/modules` + `[id]` settings), dashboard widget area + `/m/<id>`
  catch-all page. typecheck/lint/build clean, 5 module tests (102 total), live boot OK.
- **P2 — sources, lifecycle UI, RBAC & live widgets** — ▶️ **in progress. Chunk A ✅ shipped v1.4.0-beta.2:**
  `ModuleSource` table + `Module.channel`, GitHub manifest fetch with strict validation
  (`lib/modules/sources.ts`), admin **Sources** + **Browse** pages, and the **per-module opt-into-beta**
  toggle — verified against the live addons repo on both channel branches.
  **Chunk B ▶️ in progress:** **codegen registry ✅** (`scripts/gen-module-registry.mjs` → `lib/modules/generated.ts`,
  run by `prebuild`/`pretest`/`pretypecheck`) so **installing a module no longer needs a core edit** — verified
  end-to-end by building the real health-monitor module; `modules` added to `update.mjs`/`rollback.mjs`
  **PRESERVE** (an app update would otherwise have **deleted every installed module**) and `/modules/*`
  gitignored as user content. **Chunk B ✅ shipped v1.4.0-beta.3** — install from a pinned tag archive, the
  **install-time verifier** (permission-vs-code + banned constructs + archive hygiene; defence-in-depth,
  *not* a sandbox), uninstall removing files, import-your-own ZIP, and launcher rebuild-on-module-change with
  auto-recovery. **v1.4.0-beta.4** added module **provenance** at install — fixing a **data-loss risk** where
  every module was labelled `bundled`, leaving the prune guard that protects installed modules inert — plus
  the per-module channel. **v1.4.0-beta.5** added **bulk install** (select several, one rebuild/restart per
  batch, batch rolls back together on failure) and a **restart confirmation** before any
  install/import/uninstall. **v1.4.0-beta.6 completes P2:** **module RBAC via Service Groups**
  (`lib/modules/visibility.ts` — no groups = everyone, groups = members only, admins always; enforced at BOTH
  the dashboard widget list and the `/m/<id>` route, not just hidden in the UI), **per-user resizable +
  movable widgets** (`ModuleLayout` table + `lib/modules/layout.ts`; width/height 1–3 and order saved per
  user, explicit controls rather than drag-and-drop — no new dependency, works on touch and keyboard),
  **custom module icons** (`icon` on the definition), and a **multiline `"text"` settings field**. The
  **Module-admin role** needed no new work: `modules.manage` was already a delegable Access Role capability
  and now covers group assignment too. Widget-size guidance is documented in `docs/MODULES-AUTHORING.md`.
  Full P2 scope (all now delivered): git **sources** (default `JonDash-addons` repo +
  add-by-URL) + **install / update / uninstall / import (sideload ZIP) UI** + independent updates + launcher
  rebuild-on-module-change (brick-risk, plan+review); **per-module release channels** — every module has its
  own **stable/beta** channel with an *"opt into beta releases for this module"* toggle in that module's
  settings, **independent of JonDash's own app channel** (chosen channel stored on the `Module` row); backed by
  the addons repo's `main`=stable / `beta` branches + per-add-on `<id>/v<version>` tags — scheme documented in
  **`JonDash-addons/VERSIONING.md`**; a **"Module admin" role** — a delegable capability
  (extend `modules.manage` to cover add / remove / edit / update / import + assigning modules to groups) so a
  non-full-admin can manage modules, surfaced as a ready-made Access Role; **module RBAC** — a module can be
  **assigned to Service Groups** so non-admins see its widget/page (reuse `getUserVisibleLinks` / `canViewLink`,
  exactly like services); **resizable + movable live widgets** on the dashboard with **size + position saved per user**; a
  module may ship a **custom, designable icon**; and the **widget-size-affects-appearance** guidance is
  documented (authors design responsively — a small widget = compact view, larger = more detail).
- **P3 — Module runtime APIs ("make add-ons actually work")** — ✅ **built 2026-07-22, awaiting release.**
  Without these a module can render but do nothing: no working buttons, no email, and background work
  misattributed to a random admin. Added: **`moduleAction(id, handler)`** — the sanctioned mutation entry
  point (module must be installed + enabled, caller authenticated, full admin when `adminOnly`, ctx scoped to
  granted permissions, throws rather than silently no-op'ing); **`ctx.email.send()`** under `email:send`
  (throws on failure so a module can't silently not send); **`systemModuleContext(id)`** for pollers/schedulers
  so background audit entries aren't attributed to whoever loaded a page first; **`ctx.net.ping()`** under
  `network:outbound` — ICMP belongs in core because it needs the OS `ping` binary, which the verifier bans in
  modules, so the hardening (strict host validation, `execFile`, no shell, clamped timeout) lives once in
  trusted code. Consent wording for `network:outbound` widened to disclose raw TCP/DNS/TLS/ping. **Modules may
  import exactly two core paths — `@/lib/modules/types` (types, client-safe) and `@/lib/modules/api` (runtime);
  everything else arrives on `ctx`** and the verifier refuses it. 118 tests.
- **P4 — MOD-02 Health monitoring** as the first real module: a live, resizable status widget with per-service
  graphs/red-drops, a full self-contained module page (the "open the app" view), and a custom live icon.
- **P5 (later) —** hardened sandboxing/signing for untrusted third-party modules (MOD-06).

#### MOD-07 · Modifications (core-modifying add-ons) — 🌅 Reserved (future; keep the door open)
A **later** category distinct from modules: **"modifications"** that *can modify the base app itself* (not
just add alongside it) — higher trust, more invasive. **Not built now** (base app is the focus), but the
module framework must be designed so this can be added later (e.g. a separate `ModificationDefinition` with
elevated, explicitly-consented `core:*` permissions + core extension/override hooks). Reserved 2026-07-21.

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

#### MOD-04 · Arrangeable dashboard — resizable + movable tiles & widgets (per-user) — ⏳
Make the whole dashboard user-arrangeable: **both core service tiles/icons AND module widgets can be resized
and moved**, with the **layout + each widget's size saved per user** (my arrangement doesn't change yours).
Live-data widgets (crypto, PC temps, service status) render at the chosen size. **Widget size changes what a
widget shows** — the framework + author guide document responsive sizing (small = compact/glanceable, large =
detailed). Builds on the MOD-01 Phase 2 resizable-module-widget contract; MOD-04 is the full drag-to-arrange
dashboard for tiles + widgets together. (The user's "resize + movable icons/services" request lands here.)

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

#### OPS-10 · Launcher supervisor: crash capture + auto-backup & revert — ✅ Shipped v1.3.5-beta.1 (beta)
**Shipped v1.3.5-beta.1:** `scripts/supervise.mjs` (tees server output to `logs/server-*.log`, restarts
on an unexpected crash, crash-loop guard → exit codes the `.bat` branches on), `scripts/rollback.mjs`
(snapshot/restore/mark-failed), backup-before-update + auto-revert in `start-dashboard.bat`, an
opt-in **auto-install-updates** checkbox (default off) + a "last update failed, rolled back" admin
notice (`lib/update-prefs.ts`). Fixes BUG-10. Original spec below:

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

---

## Bugs / known issues

Tracked separately from features. Ordered by severity (🔴 Critical → 🟢 Low); fix priority
follows severity unless one is actively blocking. Reproduce → fix → add a regression test where
practical. Stable `BUG-##` IDs.

### 🔴 Critical
_None currently._

### 🟠 High

- **BUG-19 · A failed module import left the module installed anyway — fixed v1.5.0-beta.4.**
  `importModuleAction` wrote the module's files via `installModuleFromZip`, then resolved its declared
  helpers. When one couldn't be resolved it returned an error but never removed what it had just written,
  so `gen-module-registry.mjs` picked the folder up on the **next unrelated rebuild** and compiled the
  module in **without the helper it declared** — its scheduled work then silently never ran. The
  source-install path did the opposite (kept the module, reported the helper as a failure); the two
  disagreed. **Resolved by making both refuse:** a module that can't have its declared helper cannot work,
  so it is rolled back rather than installed inert — except on an *update*, where the files are already
  overwritten and deleting them would destroy a working module, so there it reports and keeps the new
  version. Reported by the addons session (by code review, not reproduction) 2026-07-22.
- **BUG-04 (fixed v1.3.7-beta.1 — OPS-12) · Restoring a backup broke the authenticator (TOTP).** After a
  restore, users couldn't sign in with their authenticator app, though one-time backup codes did.
  **Cause:** TOTP secrets are stored **encrypted** (`totpSecretEnc`) with the per-install AES key in
  `.data/secrets.json`, which wasn't in the backup — a different install decrypted them with a different
  key and verification failed. **Fix (OPS-12):** an **encrypted** backup now carries the master key;
  restoring **Users** adopts it (`writeSecretsFileText` + in-process `reloadEncryptionKey`) so TOTP + email
  decrypt again with no restart. Covered by a real-authenticator round-trip test (K1→K2→adopt-K1). Logged
  2026-07-20; fixed + shipped 2026-07-21 (v1.3.7-beta.1).

### 🟡 Medium

- **BUG-20 · Nothing verified an installed module had the helpers it declares — fixed v1.5.0-beta.5.**
  A module that declares a helper it does not have is **silently inert** — for a scheduler-style helper it
  imports nothing, so the build succeeds, the module looks installed and enabled, and its declared work
  simply never runs. Nothing anywhere compares an enabled module's `helpers` against what is on disk, so
  this is never detected or reported. Three ways in:
  1. **Anything installed during 1.5.0-beta.1–beta.3**, when helpers never installed at all (BUG fixed in
     beta.3). Upgrading does NOT repair them: the fix runs on install, and they are already installed.
  2. **The update path**, which deliberately keeps a module whose helper could not be resolved rather than
     destroying a working install — it audits the failure, then `requestRebuildAndRestart()` exits the
     process before the message can render, so the admin never sees it.
  3. **Files disappearing any other way** — a partial restore, a manual delete, a half-completed prune.
  **Intended fix:** on Admin → Modules, flag a module whose declared helper is missing, naming it, with an
  **Install it** action that fetches the helper and triggers the rebuild. Deliberately *detect and offer*,
  **not** self-heal: fetching a helper installs privileged first-party code, and the governing rule is that
  nothing about a module changes without the user knowing. One check covers all three symptoms.
  **Resolved:** `reconcileHelpers()` runs on Admin → Modules. A module from the OFFICIAL source heals
  itself — the missing helper is downloaded and the admin gets a **Restart now** button, since a helper is a
  compile-time import and only becomes active on a rebuild. A third-party or imported module is **reported,
  never fetched for**: provenance makes that a fact rather than a guess, and fetching code on behalf of a
  module the user got elsewhere is not a decision to make quietly. Nothing restarts on its own.
  Identified 2026-07-22 reviewing the beta.4 import fixes; fixed at the user's request the same day.

- **BUG-18 · ZIP import resolved helpers from the stable channel only — fixed v1.5.0-beta.4.**
  `importModuleAction` hardcoded `ensureHelpersFor(..., "stable")`, but a helper may be published on beta
  only — `scheduler` currently is — so sideloading any module declaring a beta-only helper failed with
  "isn't published", including the official `template`. A sideloaded package has no manifest and so no
  channel of its own; it now uses **the admin's own update channel**, so someone on stable is not silently
  given beta helper code. Reported by the addons session 2026-07-22.
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
- **BUG-10 (High) · Launcher didn't recover a *running* server crash — fixed v1.3.5-beta.1.** The
  launcher now runs the server under a supervisor (`scripts/supervise.mjs`) that captures crash output
  to `logs/server-*.log`, restarts on an unexpected crash, and gives up cleanly on a boot-crash loop
  (instead of leaving the server down with no diagnostics). Part of OPS-10.
- **BUG-14 (High) · Self-update corrupted the launcher mid-write — fixed v1.3.5-beta.2.** `update.mjs`
  overwrote `start-dashboard.bat` while it was running, so cmd re-read the changed file at a stale byte
  offset and errored (the `'rites'` error). The apply/rollback + relaunch now run on a single buffered
  line ending in `exit`, so the script is never re-read while it's being replaced. Reproduced + fixed
  against cmd.exe. Found from OPS-10 live testing 2026-07-21.
- **BUG-15 (High) · Supervisor restart-looped on an external stop — fixed v1.3.5-beta.2.** A
  console-control termination (exit `0xC000013A` — Ctrl+C / window close / an external kill such as
  antivirus) was treated as a crash and restarted, looping and signing everyone out every 1–3 min. The
  supervisor now treats control-event / signal / clean exits as a clean stop (exit 0, no restart);
  only genuine app crashes restart. +2 tests. Found from OPS-10 live testing 2026-07-21.
- **BUG-16 (Low) · Harmless `session.delete()` error logged by Prisma — fixed v1.3.5-beta.2.** Session
  cleanup used `delete` on an already-gone row (a restart race); switched to `deleteMany` so Prisma no
  longer logs an error. Was already caught (benign) — this just removes the console noise.
- **BUG-17 (Low) · `post-update` rollback marker lingered on a healthy server — fixed v1.3.5-beta.3.**
  The supervisor only cleared the marker on a crash-after-healthy, so on a server that just kept running
  it lingered — meaning a much-later unrelated boot-crash could wrongly trigger a rollback of a working
  version. Now cleared on a healthy-boot timer (~20s uptime). +1 test. Spotted reviewing the user's
  install logs 2026-07-21.

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
