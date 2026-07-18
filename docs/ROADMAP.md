# JonDash — Roadmap & Architecture Plan

> Living planning doc. Nothing here is built until agreed. Not pushed to GitHub
> until approved (per our workflow rules). Current shipped version: **v1.0.0**.

## Vision

JonDash grows from a per-user/role services dashboard into a **modular, security-first
platform**: a lean core plus installable **modules/addons** (integrations and live-data
widgets), self-service account management over email, and strong access controls
(IP/country policies, trusted-IP auto-login). Long term, **third parties can author their
own addons**.

**Scope right now:** built for the **owner's own use** (single operator). Public / broad
multi-user readiness (Docker, scale, legal, i18n, etc.) is a **later goal**, not a current
priority — we don't over-engineer for it yet.

**Deployment end-state:** eventually package everything as a **bootable VHD appliance**
that drops into a hypervisor and boots — a self-contained VM. That's a **big convert for
later**; for now we build the basis on **Windows** (the `start-dashboard.bat` launcher).

---

## Prioritized plan (simple terms)

Order = quick + security first, biggest/most complex last. Each ships only after
test → confirm → your approval → tagged push (version chosen then).

**Now / next — small + security (you asked for these soon):**
1. **2FA backup codes** ✅ *(implemented — pending release)* — one-time recovery codes issued
   at setup, usable at the login second-factor step, regenerable from the account page.
2. **Backup & restore** ✅ *(implemented — pending release)* — admin export with category
   selection (roles, users, icons, audit); accounts only leave encrypted (passphrase). Restore
   is a step-up-gated, type-"Everything" full replace.
3. **Session manager** ✅ *(implemented — pending release)* — users see & revoke their own
   sessions (device, coarse geo-location, last active); admins see & revoke all sessions.

*Also landed with the above:* step-up auth (fresh-TOTP gate for major destructive actions),
`totpVerifiedAt` session tracking, and a best-effort GeoIP service (failover + cache).

**Then — security controls + account self-service:**
4. **Settings store** — a small internal place to hold configuration (needed by the items below).
5. **IP allow / deny** — restrict access to chosen IP ranges; blocked before login.
6. **Email + self-service password reset** — configure email so passwords can be reset.
7. **Country allow / deny** — allow/block by country via external lookup (with backup provider).
8. **Trusted-IP auto-login** — no-login access from a trusted IP, with the disclaimer + warnings.

**Bigger — the customization platform:**
9. **Addon / module framework** — the plumbing that lets features & widgets plug in.
10. **Live widgets + layout** — widgets showing live data (crypto, PC temps, service status)
    on a dashboard you arrange yourself.
11. **Official Addons page** — browse / install / configure addons from your in-repo list.

**Later — big conversions:**
12. **Third-party addons** (authors build their own) — deferred.
13. **VHD appliance** — package everything as a bootable VM image for a hypervisor.

---

## Foundational enablers (build these first — everything else depends on them)

These three pieces unlock all the features below. Small, well-scoped, low-risk.

### A. Settings/config store
A typed, DB-backed key–value store with three scopes: **global**, **per-user**, and
**per-module**. Underpins email config, security policies, and addon configuration.
- New `Setting` table: `scope`, `ownerId?`, `key`, `valueJson`, timestamps.
- Typed accessors with zod validation per key; cached; admin UI panels read/write it.

### B. Module/Addon framework
A registry so features plug into the core without forking it.
- **What a module can contribute:** dashboard widgets/tiles, admin settings panels,
  nav items, API routes, background hooks, service integrations, its own migrations.
- **Extension points** (Next-friendly): core pages iterate a registry to render
  registered widgets/panels; module pages served via one catch-all route
  `/addons/[module]/[...]`. No fighting the file-based router.
- **DB:** `Module` table — `key`, `name`, `version`, `enabled`, `configJson`, `installedAt`.
- **Contract:** a `ModuleDefinition` interface (id, version, minAppVersion, register()
  hooks, settings schema, migrations). **Designed from day one to support external
  authors** (stable, documented contract) even though we start with bundled modules.
- **Install model:** modules ship **in-repo** (or arrive via the existing Git
  auto-update); "install" = **enable + configure + run its migrations**. No arbitrary
  remote code execution — safest for a security app. Third-party code comes later behind
  signing/review/sandboxing (see phase v3).

---

## The "official addons" page

- A curated **registry manifest** (JSON, **hosted in-repo**) lists available addons:
  `id`, `name`, `description`, `version`, `minAppVersion`, `category`, `configSchema`,
  docs URL.
- Admin **Addons** page renders the list with Install/Enable/Configure/Disable.
- Addons declare a **min app version** so incompatible ones are greyed out — this is why
  our version tagging matters.
- **Future:** a public addon SDK + submission/signing pipeline so **users can build and
  publish their own addons** (curated/reviewed before appearing in the official list).

## Email + self-service resets

- **Email service abstraction** (swap SMTP / provider later); SMTP config stored in the
  Settings store (secrets encrypted via existing AES helper).
- **Self-service password reset:** user requests → emailed one-time token → reset page.
  Reuses the existing hashed-token + setup-flow machinery.
- Admin "reset access" and new-user setup links can also be **emailed** instead of copied.

## Security features

### IP allowlist / denylist
Admin defines allowed/blocked CIDR ranges; enforced in `proxy.ts` (edge-safe). Mode:
allowlist (default deny) or denylist. Clear "you could lock yourself out" warning.

### Country allow/deny (GeoIP)
Allow/deny by country of the client IP. **Source: external free geo-IP API with automatic
failover** — a `GeoIpService` abstraction queries a primary provider and **falls back to
one or more backups if a provider is down/rate-limited**, with result caching to reduce
calls. Enforced server-side at the session/login guard. (Note: since lookups are external,
visitor IPs are sent to the provider; we cache and pick privacy-reasonable providers.)

### Trusted-IP auto-login (highest risk — locked policy)
Map a specific IP/CIDR → an account that is **logged in automatically without credentials**
(e.g. an internal kiosk/LAN machine).
- **Off by default for every account** (admins and users alike).
- **Admin accounts can never be auto-login targets** — hard exclusion.
- **Regular users may opt in for their own account**, but must **accept a disclaimer**
  (consent recorded + audited) before it activates.
- **Two-tier warning:** standard warning for private/LAN ranges; a **stronger warning +
  explicit typed confirmation** for any **public/external** IP before saving.
- **Enforcement:** in session resolution — no session + request IP matches an active rule
  → assume that account. Only the forwarded IP from the **known reverse proxy** is trusted
  (IPs are spoofable). Every auto-login is audit-logged; rules are per-entry enable/disable.

---

## Proposed build sequence (phases — version numbers decided at each push)

Order is a suggestion, not a commitment; we pick what to build next as we go. The version
tag for each release is decided **at push time** based on the actual scope.

1. **Foundations** — Settings store + Module framework skeleton + one sample module
2. **Email** — email service + self-service password reset + emailed setup links
3. **IP policies** — IP allow/deny (proxy-enforced)
4. **Country policies** — country allow/deny (external GeoIP + failover)
5. **Addons page** — official addons page + registry
6. **Trusted-IP auto-login** — the no-auth whitelist (per locked policy above)
7. **Third-party addon SDK** — authoring, submission, signing/review, sandboxing

Each ships only after test → confirm → your approval → tagged push (version chosen then).

## Decisions (locked 2026-07-18)

1. **Addons:** curated/bundled to start; **third-party author-created addons** are a goal
   (v3) — contract designed for that now.
2. **GeoIP:** external **free** geo-IP API, with **automatic failover** to backup
   provider(s).
3. **Trusted-IP auto-login:** off by default for everyone; **admins never** eligible as
   targets; **users opt in with a recorded disclaimer**; external IPs need the stronger
   warning + typed confirmation.
4. **Addon manifest:** **hosted in-repo.**
5. **First audience:** **owner only** for now; public/multi-user hardening deferred.
6. **Third-party addon code:** wanted eventually, but **deferred** (a while away) — keep
   addons curated/declarative for now.
7. **Deployment:** current basis is **Windows launcher**; eventual target is a **bootable
   VHD appliance** for hypervisors (big convert, later).
