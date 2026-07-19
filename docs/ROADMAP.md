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
- **Status:** ✅ Shipped · 🔨 Built (unpublished) · ▶️ In progress · ⏳ Planned · 🧊 Backlog · 🌅 Someday
- **Two views:** the **Build queue** is the single source of *priority order*; the
  **Catalog** holds the full detail for each item, grouped by category.
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
- ▶️ **SEC-02 — IP allow / deny** — next to build

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
- ✅ **OPS-01 — Shrink install footprint** — done (Phase 1 v1.1.4, Phase 2 v1.1.5)
- ⏳ **OPS-02 — Email + self-service password reset** — unlocks MOD-03 and CORE-01 email

**Backlog**
- 🧊 **CORE-01 — "No / low recovery codes" reminder**

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

#### SEC-02 · IP allow / deny — ⏳
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

#### OPS-01 · Shrink install footprint — ✅ Shipped (Phase 1 v1.1.4 · Phase 2 v1.1.5)
**Phase 1 (v1.1.4):** launcher builds only on version change, then `npm prune --omit=dev` —
node_modules 26,155 → 15,485. Config moved to `next.config.mjs`.
**Phase 2 (v1.1.5):** `output: "standalone"` + run `node .next/standalone/server.js` and remove
the top-level node_modules — self-contained install **~1,732 files (~93% cut)**. Prisma client
moved to `lib/generated/prisma` so the standalone build traces it; native binaries force-included.
An install is ~26k files, **97.5% `node_modules`**; our own source is ~120 files. Levers:
- **Next.js `output: "standalone"`** — traces only runtime deps (biggest reduction).
- **Drop dev-only deps at runtime** (`npm ci --omit=dev` / prune after build).
- **Ship prebuilt releases** (the standalone build) rather than source-that-each-machine-builds.
- *Interacts with:* auto-update (fetch prebuilt release) and OPS-03 (imaging sidesteps file counts).
- **Standing rule:** avoid adding heavy dependencies casually; keep the runtime footprint in mind.

#### OPS-02 · Email + self-service password reset — ⏳
Email service abstraction (SMTP config in the Settings store, secrets encrypted). Self-service
password reset via emailed one-time token (reuses the hashed-token + setup-flow machinery).
Admin "reset access" and new-user setup links can also be emailed. **Unlocks MOD-03 alerting.**

#### OPS-03 · VHD appliance — 🌅
Package everything as a bootable VM image for a hypervisor. Big convert, later.

### CORE — Core app & UX

#### CORE-01 · "No / low recovery codes" reminder — 🧊 Backlog
Nudge accounts that have no (or few) backup codes to generate a set; closes the gap for
accounts created before v1.0.1. Pushed back 2026-07-19; low urgency.

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
- **v1.1.5** (2026-07-19) — OPS-01 Phase 2: standalone self-contained build, remove node_modules at runtime (~26k → ~1.7k files); Prisma client generated to `lib/generated/prisma`.

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
