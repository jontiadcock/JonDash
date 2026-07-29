# JonDash — Roadmap

> Living planning doc. Nothing here is built until agreed; nothing is pushed until
> approved (per the workflow rules). Each release is version-tagged at push time.
>
> **Features and planned work only.** Defects are tracked separately, in a bug tracker that is not
> published yet — see **OPS-15**.

## How to read this roadmap

- **Stable IDs.** Every item has a permanent ID (`SEC-04`, `MOD-01`, …). An ID never
  changes even if priority does, so it's always safe to reference. Categories:
  - **SEC** — security & access control
  - **MOD** — modules & customization platform
  - **OPS** — platform, packaging & operations
  - **CORE** — core app & UX
  - **BUG** — a defect; tracked by severity in the separate bug tracker (**OPS-15**), never here
- **Status:** ✅ Shipped · 🔨 Built (unpublished) · ▶️ In progress · ⏳ Planned · 🧊 Backlog · 🌅 Someday
- **Views:** the **Build queue** is the single source of feature *priority order* and holds **only
  unbuilt work**; the **Catalog** holds per-feature detail by category, including shipped items and the
  version each shipped in. Defects live in the separate bug tracker (not yet published — **OPS-15**);
  per-release history lives in **`CHANGELOG.md`**.
- **Retiring an item:** when something is delivered by other means or dropped, remove it from the queue
  and the catalog and add a row to **Retired IDs** saying which and why. **IDs are never reused** — an
  old reference must always resolve.
- **Standardize on every edit:** a new item gets the next free ID in its category and is
  slotted into the build queue by priority. Keep one canonical entry per item (don't
  re-describe it in multiple places). Don't change existing priorities without the user.
- **The `/JonDash-view-roadmap` board groups by criticality, not by phase** (user rule, 2026-07-22). It
  reads this file **and the bug tracker**: a bug's severity is authoritative, while a feature's criticality is
  derived from its status — in progress or next in the queue = High, Planned = Medium, Backlog or
  Someday = Low.

## Vision

JonDash is a per-user/role services dashboard that grew into a **modular, security-first platform**: a
lean core plus installable **modules** (integrations and live-data widgets), self-service account
management over email, and strong access controls (delegated admin, IP policies, trusted-IP auto-login).

The platform half is **done** — modules install, update and extend the app without touching it
(v1.4.0 / v1.5.0). What's left is the security and self-service half. Modules stay **curated or
self-built**: anyone may write and import one, but sandboxing for untrusted third-party authors was
considered and dropped (retired MOD-06), so "only install modules you trust" is a standing condition,
not a temporary one. Country-based policy was also dropped (retired SEC-03).

- **Scope now:** built for the **owner's own use** (single operator). Broad multi-user /
  public readiness (Docker, scale, i18n, legal) is a later goal — not over-engineered for yet.
- **Deployment end-state:** package everything as a **bootable VHD appliance** for a
  hypervisor. Big convert for later; for now the basis is **Windows** (`start-dashboard.bat`).

---

## Build queue (priority order — do not reorder without the user)

Built one at a time, each via the per-item workflow (plan → preview → review → implement →
self-test → hand off → cleanup). Each ships only after test → confirm → approval → tagged push.

**CORE-04 + CORE-06 shipped in v1.7.0** (2026-07-25) — the UI rework and rebranding are done; the style
system that came out of them is CORE-07. This list is only what's left to build — shipped items live in
their **Catalog** entry (which names the version each shipped in) and in `CHANGELOG.md`, not here. The
**modules platform is complete**: MOD-01 (v1.4.0), MOD-02 (the `health-monitor` module), MOD-08 (v1.5.0),
MOD-09/10 (v1.5.2); MOD-11 is the last small item.

**Now in flight: the 1.8.0 UI-rework release** (from 2026-07-27, owner-directed). It is a *release*
rather than a queue item — roughly thirty changes agreed up front as a dozen groups, shipping as a
run of betas, and it cuts across items already listed below as well as work that never had an ID.
**All groups are now built** — the last four landed as **v1.8.0-beta.21** (Network & HTTPS),
**beta.22** (backup and restore), **beta.23** (OPS-16) and **beta.24** (help page, support line and
the responsive sweep). What remains before promoting 1.8.0 to stable is the owner's testing, the
add-ons hand-off prompt, and module screenshots — which are add-ons work, not core's.

**The queue below therefore does not describe what is being built right now.** Shipped 1.8.0 items
carry their version in the catalog, as usual; the release's own plan is the day-to-day authority
while it runs.

**Previously in flight: OPS-18** — moved to the front on 2026-07-25 at the owner's direction, because
it blocked another session's work while nothing blocked it.

1. ▶️ **OPS-18 — Elevation binaries (`jondash-grant`)** *(active, owner-directed 2026-07-25)* — unblocks
   the add-ons session's `host-services` helper. **Windows only** (owner decision) — the Linux design is
   recorded but not built, because OPS-19 must land first for it to be reachable or testable. Contract
   settled with add-ons; see the catalog entry
2. ⏳ **OPS-19 — Run JonDash on Linux** *(owner request 2026-07-25)* — the launcher is the real work: a
   `.sh` mirroring the `.bat`'s supervisor **contract** (exit codes 10/11/12/13), not just `node`. Also
   swap PowerShell `Expand-Archive` for `fflate` (already a dependency), privileged ports for HTTPS, and a
   case-sensitive build pass. **Position not confirmed by the owner** — move it freely
3. ✅ **CORE-08 — Dashboard widget interaction rework** — shipped **v1.8.0-beta.1**, 2026-07-27. Closed
   BUG-53/54/55 with it
4. ⏳ **SEC-04 — Session lifecycle hardening**
5. ⏳ **SEC-05 — Trusted-IP auto-login**
6. ✅ **OPS-13 — Email: bounded, diagnosable connection testing** — **already satisfied**, verified
   2026-07-27 when 1.8.0 scheduled it. Nothing was built; see the catalog entry, which records why so
   it is not scheduled a third time
7. ⏳ **OPS-02 — Self-service password reset (SSPR)** — email itself already shipped (v1.2.5)
8. ✅ **OPS-07 — Bring-your-own cert: upload + validate + report** — shipped **v1.8.0-beta.21** (the
   optional OS cert-store half was dropped; see the catalog entry)
9. ✅ **OPS-08 — Let's Encrypt: request without a restart, errors verbatim** — shipped **v1.8.0-beta.21**
10. ⏳ **MOD-11 — Hand helper APIs through the context** — makes capability checks enforcement rather than
   advice; worth doing before helper-side enforcement spreads
11. ✅ **OPS-16 — Back up & restore a module's *and helper's* own data tables** — shipped
   **v1.8.0-beta.23**, version-matched with a report for anything skipped
12. ⏳ **OPS-17 — Revert to a chosen version ("custom version")** — pick any published version and roll
   back to it; **no compatibility work, just a warning + disclaimer** ("this may break your JonDash").
   Owner request 2026-07-25. **Position not yet confirmed by the owner** — move it freely
13. ⏳ **OPS-14 — Tell a beta user when their channel is behind stable** — small, and closes a blind spot
   **core itself created** in v1.5.3-beta.9. **Position not yet confirmed by the owner** (added
   2026-07-24) — move it freely
14. ✅ **CORE-10 — Admin → Permissions + declarative capability contract** — shipped v1.7.2-beta.1
15. ⏳ **CORE-09 — Modules page: search, filter, compact list** *(owner request 2026-07-26)* — the
   full-card-per-module layout is already unwieldy and gets worse as more ship. Owner said **"let us
   do that later"**, so position is open. Keep a dangerous permission identifiable without expanding
16. ✅ **CORE-05 — "Buy me a coffee" banner + `/help-meeeee` support page** — shipped **v1.8.0-beta.24**
17. 🧊 **SEC-02 — IP allow / deny** — deprioritised 2026-07-20; revisit alongside SEC-05, which shares the
   trusted-proxy XFF prereq
✅ **SEC-07 — Service accounts** — shipped v1.7.3-beta.1, 2026-07-26. Unblocks the add-ons MCP helper.
19. 🧊 **OPS-06 — Optional skip of browser auto-open on launch** — reclassified from BUG-06
20. 🌅 **MOD-07 — Modifications (core-modifying add-ons)** — reserved; the module framework must stay able
    to add it later
21. 🌅 **OPS-03 — VHD appliance**
22. 🌅 **OPS-15 — Publish the bug tracker + security reviews** — deliberately held back for now; see the
    catalog entry for why and for what has to be true first

_(Known bugs are tracked separately by severity, in a bug tracker that is **not published yet** — see
**OPS-15**. Nothing currently open blocks **SEC-04**, which stays next.)_

### Retired IDs — never reused

| ID | What it was | Why it's gone |
| -- | ----------- | ------------- |
| SEC-03 | Country allow / deny (GeoIP) | Dropped by the owner, 2026-07-21 |
| OPS-09 | SMTP provider presets + auth-type clarity | Dropped by the owner, 2026-07-21 |
| CORE-03 | Mobile / responsive support | Moved to **Ongoing maintenance** below, 2026-07-21 |
| MOD-03 | Health monitoring alerting (Phase 2) | **Delivered** by the `health-monitor` module — email + webhook alerts on state change, credentials encrypted in the module's own store. Closed 2026-07-22 |
| MOD-05 | Official Addons page | **Delivered** by MOD-01 Phase 2 — `addons.json` manifest, `/admin/modules/browse`, install/enable/configure/disable, `minAppVersion` enforced. Closed 2026-07-22 |
| MOD-04 | Arrangeable dashboard (core tiles too) | Dropped by the owner, 2026-07-22. Per-user **module widget** sizing/ordering shipped in v1.4.0 and stays; arranging core service tiles is not wanted |
| MOD-06 | Third-party addons (sandboxing / signing) | Dropped by the owner, 2026-07-22. Modules stay a **curated / self-built** feature — the install-time verifier plus permission consent is the security model, and it is documented as defence in depth, not a sandbox |
| CORE-01 | "No / low recovery codes" reminder | Dropped by the owner, 2026-07-22 |
| SEC-06 | Scoped API tokens + read-first JSON API (`/api/v1`) | **Retired by the owner, 2026-07-27.** It existed for one reason: an **external** MCP server had to authenticate across a process boundary. MCP is now a **helper running in-process**, so there is no boundary and nothing to authenticate — the add-ons session confirmed nothing they ship now or later needs it. Owner's standing position: if helpers + modules can carry it, it goes to archive and **does not come back out**. Retiring it rather than leaving it dormant is deliberate — a backlog item whose rationale has evaporated is one somebody eventually builds on the old reasoning. If an external client is ever wanted, that is a new item with its own justification, not this one revived |

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
- **Do not start this before the trusted-proxy request resolver exists** — an IP→account rule is only as
  trustworthy as the client IP behind it. Tracked in the bug tracker (**OPS-15**).

#### SEC-07 · Service accounts — an identity nobody can log in as — ✅ Shipped v1.7.3-beta.1 (2026-07-26)

**Shipped as specified.** `lib/auth/service-accounts.ts` holds the single definition of "is this a
login?"; `countHumanAdmins()` is the lockout guard and the only thing `hasActiveAdmin()` calls.
Sign-in, setup-link completion and admin reset all refuse. `listBindableAccounts()` /
`resolveBindableAccount()` are the helper surface; `onIdentityRemoved` is the hygiene hook;
`getEffectivePermissionsUncached` is exported with `cache()` as a thin wrapper. 19 tests in
`tests/unit/service-accounts.test.ts`, plus a live pass: created one through the form, confirmed the
badge, confirmed sign-in answers exactly like an unknown address, and confirmed that with only an
ACTIVE ADMIN service account left both `/` and `/login` still redirect to the recovery wizard.

Original specification below.

> **BLOCKING.** The add-ons session's MCP helper cannot ship until this exists. The owner decided its keys
> bind to service accounts **only** — no interim where an agent binds to a real person's account —
> because allowing real users now and restricting later would invalidate every key already minted, on a
> security boundary. *Never allowing it is cheaper than taking it away.* They are building everything else
> (listener, auth, key store, tools, settings page); the binding target is the sole dependency.
> (Corrected 2026-07-26: first relayed as non-blocking, then reversed by the owner the same day.)

An identity that holds permissions and appears in the audit log, but has **no login surface at all**.
Created alongside a user ("Create service account"), and **generic on purpose**: the owner considered an
MCP-specific version and chose this, so any helper can bind to one and core stays ignorant of individual
add-ons, as it is everywhere else.

**Why:** a helper that mints a key for an agent must bind it to a JonDash identity to inherit RBAC. Today
that has to be a real person's account, so the agent's identity is also a live login surface with a
password, MFA and a reset path it never needs; the audit log blames a person for what an agent did; and
revoking the agent means locking out the human.

**"Cannot log in" has to be total** — a half-closed door is worse than none:
- **No password.** Not a blank one — no credential any comparison can satisfy.
- **Refused at sign-in *before* any password check**, so the account cannot be probed for existence.
- No setup token, no password reset, no MFA enrolment, no recovery codes.
- Cannot be promoted to a normal account, nor a normal account converted into one.
- **Visibly a service account wherever users are listed** — not a person with an odd name.

**⚠ THE LOCKOUT EDGE — verified in code 2026-07-26, and it is not a counting nicety.** There is **no
explicit "at least one admin" guard** in this app. The invariant is held implicitly by *"you cannot
delete or disable yourself"* (`app/admin/actions.ts`). The real exposure is
**`hasActiveAdmin()` in `lib/auth/bootstrap.ts`**, which counts `role: ADMIN, status: ACTIVE` and is the
sole gate on the **first-run recovery wizard** — it is consulted by `app/page.tsx`, `app/login/page.tsx`
and six times in `app/welcome/actions.ts`.

So if a service account can hold `ADMIN` and be `ACTIVE`, then once every human admin is gone the wizard
**never appears**, and nobody can sign in as the account keeping it quiet. The install is permanently
unrecoverable — the owner's one absolute red line. **`hasActiveAdmin()` must count humans only**, and that
single predicate is the whole fix. Any future explicit admin-count guard inherits the same requirement.

**In scope (owner, 2026-07-26 — both confirmed, not optional):** disable/delete in **one action**, and a
way for a helper to learn it happened so it can drop keys bound to that identity.

**Audit attribution (owner, 2026-07-26):** every action taken under a service account is **clearly
attributed to that account** in the audit log — not to "a user", and never to a person. This was half the
original justification: today the log reads *"jonti revoked session X"* when it was an agent.

### The helper-facing surface — AGREED 2026-07-26 (owner decided each item)

Designed with the add-ons session rather than handed over finished, and **futureproofed**: MCP is the
first consumer, not the only one.

- **A helper binds to an opaque, stable id and nothing else.** It stores the id and re-resolves on every
  call. Never a name — names get renamed and a key bound to one breaks silently, the worst failure mode
  for a credential. The id is **not** a foreign key in the helper's own tables: a helper must not
  constrain core's `User` table, so it verifies rather than references.
- **Core exposes a list of bindable accounts, and that list contains service accounts ONLY** — user
  accounts never appear in it. The helper selects from that list, and refuses to bind to anything absent
  from it. One source of truth: no separate `isServiceAccount()` that could disagree with the list.
- **Exactly four fields are readable:** `id` (stored, stable), `displayName` (rendered at display time,
  never stored by the helper, so renames are free), `status` (so a disabled account fails closed), and
  `role` (because `getEffectivePermissions` takes `{ id, role }`). Deliberately no more — if the surface
  ever grows a secret, a helper must not be able to read it.
- **Deletion: a hook for hygiene, never for safety.** Core provides something like
  `onIdentityRemoved(accountId)` so a helper can drop its key rows and stop listing a key that points at
  nothing. **The security property must not depend on that notification arriving** — the helper
  re-resolves per call and fails closed when the account is missing or not `ACTIVE`, and that stays true
  regardless. Do not design the hook as load-bearing.
- **Renaming stays possible.** Free, given the id/displayName split above.
- **Re-pointing an existing key at a different account is NOT possible** and will not be offered.
  Revoke and mint is one extra click and is honest; moving a key silently changes what an agent can do
  with no signal to the agent or its operator.
- **Any number of service accounts, and two helpers may share one.** No exclusivity constraint — someone
  will reasonably want a read-only watcher and a privileged account at once. That kind of limit looks
  tidy and blocks a real setup later.
- **An account is never bound to a specific helper.** That would be core knowing about individual
  add-ons again; the helper decides what it accepts.

### `getEffectivePermissions` outside a request — owner chose (a), 2026-07-26

`lib/auth/permissions.ts` wraps it in React's `cache()`. Every caller today is inside a request; a
helper's listener (started from `onBoot`) has no request scope and no React render.

**Measured, not assumed (2026-07-26):** `cache()` called outside a render **neither throws nor
memoizes** — each call simply runs. So calling it as-is is safe *today*, and the absence of memoization
is the safer behaviour anyway (a process-wide permission cache shared across agents would be worse than
none).

**But that is undocumented React internal behaviour, not a contract.** If a future React changed it —
to throw, or to memoize process-globally — authorization would break or leak, silently, in the one
function where that matters most. So: **export an uncached sibling** (`getEffectivePermissionsUncached`)
and make `cache()` a thin wrapper over it. One implementation, two entry points, intent explicit. A few
lines, and it futureproofs every helper that ever authorizes outside a request — which, given what
helpers are for, will not only be MCP.

#### Security hardening backlog (from `docs/SECURITY-REVIEW.md`)
Dummy-argon2 on unknown-user login (timing), `poweredByHeader:false`, TOTP replay
prevention, signed-update verification, durable (Redis) rate-limit.

_(Individual items are also tracked in the unpublished bug tracker — **OPS-15**.)_

### MOD — Modules & customization platform

#### MOD-01 · Module framework — ✅ Shipped v1.4.0 (P1–P3; 2026-07-22)
Plug-and-play **modules** that plug into the core with a hard **isolation guarantee** (the baseline app is
never affected — "remove the app, the phone is fine"), **installed & updated over public git independently
of the base app**, and **permission-gated** at install. Author-facing contract:
**`docs/MODULES-AUTHORING.md`**. Key points:
- **Isolation:** the core **never imports a module** — only a build-time **generated registry**
  (`scripts/gen-module-registry.mjs` scans a gitignored, update-preserved `modules/` dir). Zero modules ⇒ the app is
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
  (consent + scoped context for **curated / self-built** modules). Hardened sandboxing for untrusted
  third-party authors was considered and **dropped** (retired MOD-06) — this is the security model.
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
- **P3 — Module runtime APIs ("make add-ons actually work")** — ✅ **shipped v1.4.0-beta.3.**
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
- **P4 — MOD-02 Health monitoring** ✅ as the first real module (built in the add-ons repo, not here).
- **P5 —** hardened sandboxing/signing for untrusted third-party modules: **not happening** (retired
  MOD-06, 2026-07-22). Modules remain curated / self-built, gated by the verifier + consent.

#### MOD-11 · Hand helper APIs through the context, so capability checks are enforcement — ⏳
`ctx.can()` (MOD-10) lets a helper refuse an operation its caller never declared, and it is
**advisory only**. The module is what passes the context to the helper, so it can pass a lookalike:
`helperApi({ ...ctx, can: () => true })` defeats the check entirely, and freezing `grants` does nothing
because a spread builds a new object. `moduleId` goes the same way, taking a helper's audit attribution
with it. Raised by the add-ons session 2026-07-23 **after building against it** — verified, and pinned by
a test so it can't be quietly assumed away.
- **The fix is a shape this framework already uses.** Core hands the helper's API over as a field on the
  context, present only when the module declared the helper and was granted its capabilities — exactly
  like `ctx.fetch`. The module then never constructs the object the helper sees, enforcement is field
  presence again, and the verifier's binary import gate stops being load-bearing.
- **A cheaper sound option, if the full shape is too much:** core issues an unforgeable per-context grant
  token; the helper passes it back to a core function which answers from the DB rather than from the
  passed object. Smaller, but adds a second mechanism where the first already works.
- **Not urgent, and say why:** modules are curated or self-built (a permanent locked decision), the
  verifier still refuses the import unless the helper is declared, and helper operations stay inside
  admin-approved roots. This closes a gap between what a check *reads* as and what it *is*, which matters
  most for the next person reviewing it.
- **Do it before enforcement is widespread.** The add-ons session writes helper-side enforcement in
  `filesystem 0.0.3-beta.1`; every helper written against the advisory shape is rework later.

#### MOD-10 · Helper updates, channels + opt-in auto-update — ✅ Shipped v1.5.2 (2026-07-23)
Helpers were designed as an invisible implementation detail — "users never install or remove one" — but
they are versioned, published artifacts with their own defects and their own fixes. Those two facts were
in tension, and the gap showed up as two silent failures.
- **A helper fix could reach nobody.** `lib/modules/updates.ts` never mentioned helpers, and
  `reconcileHelpers` only heals *absent* ones, so a stale-but-present helper was never touched. A helper
  could publish a security fix that no existing install would ever receive.
- **A shared helper flip-flopped.** `ensureHelpersFor` took the *calling module's* channel, so with two
  dependents on different channels the version swapped with whichever module was touched last.
- **Now:** helpers have a `channel` (**derived — highest among dependents**, so beta wins and the
  flip-flop stops; safe only because a helper never breaks its API, so a newer one always satisfies an
  older consumer), their own section on **Admin → Updates**, and an optional **admin pin** that overrides
  the derived value. The Helpers page says *why* it's on that channel.
- **Opt-in automatic module updates, PER MODULE** (`Module.autoUpdate`, off by default). Deliberately not
  one global switch: a single tick would hand every source — including any public repo added by URL — a
  standing channel to run new code. **An update that ADDS a permission is never auto-applied**, whatever
  the setting; consent is not something a preference can waive. This narrows the 1.5.0 rule from "modules
  are never updated automatically" to "never, unless you asked for it, for that module".
- **"Update everything"** — all add-ons in one rebuild and restart. Scoped to add-ons on purpose: a module
  can require a newer app version, so the app would have to go first and restart, and a failed app update
  that rolled back would leave add-ons updated against an app that no longer exists.
- **Compatibility (the honest part).** The charter's "a helper never breaks its API" was a *promise with
  nothing enforcing it*, and adding an update path makes helpers move often — turning a latent risk live.
  So: a module may declare `helpers: [{ id, minVersion }]` (additive; bare ids still work), a helper may
  declare `breakingFrom`, and an update that would break a dependent **names the modules and refuses
  until confirmed**. Still missing, and worth doing: a publish-time diff of `api.ts`'s exported surface,
  so a helper cannot break silently — that belongs in the add-ons session's publish gate.
- 226 tests (was 207). Live manifests on both channels re-parse unchanged; nothing needs republishing.

#### MOD-09 · Helper-named capabilities + consent roll-up — ✅ Shipped v1.5.2 (2026-07-23)
Closes the gap that made MOD-08's consent guarantee unenforceable. A helper could **provide** a capability
but not **name** one: `sources.ts` filtered a helper's `provides` against the four core permissions, so
`files:write` was **silently dropped**. And nothing consumed `provides` at all — `install-button.tsx` said
so in a comment ("true by luck today only because the scheduler asks for no permissions"). A module could
take a filesystem helper and the approval screen would list only its own milder permissions.
- **Capabilities are `{id, label}`**, `id` namespaced `<helperId>:<verb>`; the **helper supplies the
  wording**, which is safe only because helpers are first-party-only. Runtime keeps `describe(config)` so
  the sentence can name real directories; the manifest carries a static label because browse-time consent
  runs before any helper code or config exists.
- **Consent lists every capability of every helper a module declares** — whether or not the module named
  it. Declaring the helper is what grants access, so the module's honesty isn't load-bearing.
- **Helper-provided ⇒ high-risk by default.** Core has no opinion about a capability it didn't define.
- **Which helper backs a permission is derived from the namespace**, replacing a hardcoded
  `files:*` → `filesystem` map — that map was the coupling that stopped a new helper naming its own
  capability without a core release.
- **Malformed = refused, never dropped.** Silent filtering is how the original gap stayed invisible.
- **Verified against the live manifests on both channels**: `health-monitor`, `template` and `scheduler`
  all parse unchanged, so nothing needs republishing. 207 tests (was 191).
- Raised by the add-ons session while specifying the `filesystem` helper for Backup Manager, which is
  blocked on it.

#### MOD-08 · Module updates + helpers — ✅ Shipped v1.5.0 (2026-07-22)
The second half of the platform: keeping installed modules current, and letting a module do work it can't do
alone. Design of record: **`docs/HELPERS-DESIGN.md`**; author-facing contract: `docs/MODULES-AUTHORING.md`.
- **Module updates** in **Admin → Updates**, in their own section under the app's own panel — installed vs
  available version, channel, source; batch update in one rebuild/restart; module data preserved. **Modules
  are never updated automatically**, even when the app auto-updates itself — the app may change on its own,
  a module never does. An update that **adds** a permission needs explicit approval for that specific change;
  one that gives permissions up applies silently. Update also runs the module's new migrations
  (`ensureModuleMigrations`, keyed on `migratedVersion`, retried on failure) and rewrites `grantedPermissions`.
- **Helpers** — first-party privileged capability a module declares and depends on. **Official source only,
  enforced in code** (a `helpers` array from any other source is silently dropped); auto-installed with the
  module that needs them and pruned when the last dependent goes (files only — **helper-owned data is
  never destroyed**); read-only **Admin → Helpers** page listing each helper and its dependents. Boot phase
  via `instrumentation.ts` → `lib/helpers/boot.ts`, each helper isolated and 5s-bounded so one can never stop
  the server starting.
- **Declared background work** — `schedules: [{ key, everyMs, run(ctx) }]` on `ModuleDefinition`, run by the
  `scheduler` helper **from server start** rather than from the first page render. Declarative on purpose: a
  module never runs arbitrary code at boot and its schedule is inspectable without executing it. Fixes the
  real defect it was built for — a restart at 03:00 no longer leaves services unwatched until morning.
- **Self-heal** — a module missing something it needs is detected on Admin → Modules; **official-source**
  modules have the missing files re-fetched with a *Restart now* button, imported/third-party ones are
  reported with what's wrong. Nothing restarts on its own, and JonDash never fetches code on a third party's
  behalf.
- **Verifier extended:** `@/helpers/<id>/api` allowed only for declared helpers and nothing deeper; a module
  may import its own files but **not another module's** (the old check allowed every `@/modules/…` path).
- **Filesystem helper deliberately deferred** — it needs admin-configured roots (its own UI chunk), and its
  consumer must be defined *before* the API is designed, or the test only proves the helper matches itself.

#### MOD-07 · Modifications (core-modifying add-ons) — 🌅 Reserved (future; keep the door open)
A **later** category distinct from modules: **"modifications"** that *can modify the base app itself* (not
just add alongside it) — higher trust, more invasive. **Not built now** (base app is the focus), but the
module framework must be designed so this can be added later (e.g. a separate `ModificationDefinition` with
elevated, explicitly-consented `core:*` permissions + core extension/override hooks). Reserved 2026-07-21.

#### MOD-02 · Health monitoring (first module) — Phase 1: status only — ✅ Shipped (add-ons repo)
Built and published by the add-ons session as the `health-monitor` module, on both channels. It went
further than the Phase-1 scope below: HTTP, TCP, ping, DNS and certificate checks, uptime + response-time
history, and email/webhook alerts. Its own versioning and roadmap live in **JonDash-addons**, not here —
this entry stays only to record that the core-side goal is met. Original scope, for reference:
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

_MOD-03, MOD-04, MOD-05 and MOD-06 are **retired** — see the Retired IDs table in the build queue.
MOD-03 and MOD-05 were delivered (by the `health-monitor` module and by MOD-01's Browse page); MOD-04
and MOD-06 were dropped by the owner on 2026-07-22._

**The one leftover from MOD-05 was closed in v1.8.0-beta.17.** Browse used to *print* a module's
requirement ("needs JonDash 1.5.0+") without greying out entries this build is too old for;
enforcement was always real, only the visual cue was missing. The catalogue now dims them **and**
keeps the sentence — dimming on its own reads as a rendering fault rather than a rule.

### OPS — Platform, packaging & operations

#### OPS-17 · Revert to a chosen version ("custom version") — ⏳ Planned
Owner request 2026-07-25. Let an admin pick **any** published version and roll the install back (or
forward) to it from Admin → Updates, rather than only taking the newest on their channel.

**Deliberately unguarded, by owner decision.** No compatibility checking, no migration reconciliation, no
"is this sensible" logic — the whole safety story is a **warning and disclaimer** the admin must accept:
*"this may break your JonDash."* That keeps the feature small; it is the owner's install and their call.

- Reuses what already exists: the updater can fetch any tag, and **OPS-10's snapshot/auto-revert** remains
  the backstop if the chosen version won't boot.
- **The honest risk to state in the warning:** going *backwards* past a database migration is the one thing
  the snapshot can't always undo — an older build may not understand a newer schema. Say so plainly rather
  than implying a clean rollback.
- Keep it out of the way of the normal update path (it isn't an "update"), and audit which version was
  chosen and by whom.

#### OPS-16 · Back up & restore a module's own data tables — ✅ Shipped v1.8.0-beta.23
**Shipped, and widened to helpers** (owner, 2026-07-27, after the add-ons session raised it — the MCP
helper keeps its credentials in `hlp_mcp_*`, so a backup that took every module's data and skipped
the helper holding the keys would restore an install that looked complete and could not talk to
anything).

A module or helper declares `backup: { tables: [{ name, secret? }] }` — logical names, resolved by
core through `moduleTableName()`/`helperTableName()`. **Undeclared means not exported.** `secret`
columns follow core's own rule (kept in an encrypted backup, blanked from an unencrypted one), which
is the part no add-on author could have known from their side.

**Restore is gated on an exact version match**, in both directions — not "newer is fine", because
core cannot know whether a patch release renamed a column, and the cost of guessing wrong is a
corrupted module rather than a missing one. Anything skipped is reported on screen **and written to
the audit log**, since the person asking why the data is missing is usually reading the log a month
later. Add-on tables are written after the main restore transaction commits, each in its own
transaction: a third-party schema failing must not roll back the restore of the app itself.

*Original scope below.* Owner request 2026-07-25 (asked "does backup cover module data?"). **Partly, at the time.** A backup
(`lib/backup.ts`) already carries each module's **settings**, its generic key/value **`records`** store,
and each user's widget **`layout`** — but **not** the module's bespoke **`mod_<id>_*` SQL tables** (the
ones a module creates through its own migrations — e.g. health-monitor's history). Those are excluded on
purpose: the table schema belongs to the module **version** installed at restore time, and writing rows
from a different version back in corrupts the module rather than restoring it.

This item closes the gap **safely**, rather than by lifting the exclusion blindly:
- Capture the `mod_<id>_*` tables in the `.dashbk` archive, tagged with the module **id + version**.
- On restore, rewrite a module's tables only when the installed version **matches** (or the module offers a
  migration path); otherwise **skip with a clear report**, never a silent partial/ corrupting restore.
- Keep it inside the existing encrypted `.dashbk` format and the step-up-gated restore flow.

Independent of the UI rework — deserves its own focused beta so a restore can be tested carefully. **Queue
position not yet confirmed by the owner** — move it freely.

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

#### OPS-02 · Self-service password reset (SSPR) — ⏳
**Scope is now SSPR only.** Outgoing email shipped in **v1.2.5** and is no longer part of this item —
`nodemailer` with authenticated SMTP (app password; Gmail/Outlook/Hotmail/M365 presets) **and OAuth2**
for Google + Microsoft (XOAUTH2, admin-registered app + consent flow), encrypted config in the Settings
store, and an ADMIN-only **Admin → Email** page with a test-send (`lib/email/*`).

What's left to build: **a user resets their own password via an emailed one-time token**, reusing the
existing hashed-token + setup-flow machinery; plus **emailed new-user setup links** and an emailed admin
"reset access", so an admin no longer has to hand a link over by other means.

**Do OPS-13 first.** SSPR is only as reliable as email delivery, and today a failing send can hang with
no diagnosis (**BUG-21**) — shipping a password-reset flow on top of that would turn a silent email
failure into a user locked out with no explanation.

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

#### OPS-06 · Optional skip of browser auto-open on launch — ▶️ Scheduled into 1.8.0 (owner request 2026-07-27)

**Out of backlog and into the 1.8.0 UI-rework release**, grouped with the update/launcher work
because it is the same file and the same boot path. Two routes, deliberately: a `.data` flag written
by an in-app toggle (survives updates, for "stop doing this now that I'm set up"), and a
`JONDASH_NO_BROWSER` env var for a headless box that must never open one *before* anyone can reach
the UI — a UI-only switch cannot be set by someone who can't see the window it opened.

Original entry below.
An improvement, not a defect: `start-dashboard.bat` opens the browser on first launch
(`start "" "%DISPLAYURL%"`) with no way to disable it for a headless / remote-server setup. Add an
opt-out the launcher checks before opening — a `.data` flag, a launcher argument, or an env var
(e.g. `JONDASH_NO_BROWSER`).

#### OPS-07 · Bring-your-own certificate: guidance + validate/upload, or OS cert store — ✅ Shipped v1.8.0-beta.21
**Shipped:** the certificate is **uploaded and copied into `.data/tls/` at 0600**, not referenced by a
path — a path is a promise about a file JonDash doesn't control, and it breaks at a restart long after
the admin has forgotten. The pair is validated before anything is stored (PEM shape per file, then
`createSecureContext` to prove the key belongs to the certificate), and an **Installed certificate**
panel reports issuer, subject, every SAN, expiry with days remaining, expired / not-yet-valid /
self-signed, and whether the running server is actually serving it yet. The legacy `certPath`/`keyPath`
fields remain and still work, so an install already serving from a path keeps HTTPS across the update.
**Not done, and deliberately:** picking from the Windows certificate store. It was the "if feasible"
half; Node has no first-class access, and the upload path makes it a convenience rather than the only
way in.

*Original scope below.* Make the BYO-cert path (Admin → Network & HTTPS) friendlier and safer to configure. Extends OPS-05.
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

#### OPS-08 · Let's Encrypt: process-oriented progress feedback — ✅ Shipped v1.8.0-beta.21
**Shipped:** a **Request certificate now** button that runs issuance from the admin page instead of
waiting for the next restart, reporting the outcome in place and **relaying Let's Encrypt's own error
text verbatim** on failure — that wording names the actual problem (wrong A record, port 80
unreachable, a rate limit), and paraphrasing it into "request failed" throws away the only diagnosis
available.

**The part worth knowing:** the HTTP-01 challenge is answered by the plain-HTTP listener inside
`server.mjs`, which is outside the Next build and cannot see a variable set by a server action. The
token is therefore written to `.data/tls/challenge/` and the listener checks memory *and* disk. Stale
tokens are swept at startup and after every run.

**Not the step-by-step progress list originally described** — the ACME client reports completion, not
phases, so a five-step display would have been an animation rather than a status. The button reports
working / issued / the real error instead.

*Original scope below.* Today enabling Let's Encrypt saves the config and issuance happens on the next restart, with only a
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

#### OPS-14 · Tell a beta user when their channel is BEHIND stable — ⏳
Proposed by the add-ons session 2026-07-24, and accepted: **core can see this where the publisher cannot.**
Core knows the installed version and can read both channels' manifests; the publisher only sees their own
repo. A beta user whose installed version sorts *below* the stable release is in a state no publisher
intends, and today nothing says so.

**This gap is one core created.** Before v1.5.3-beta.9 an older offering was listed as an available update,
so the situation at least announced itself — badly, as a downgrade with a tick-box (BUG-31). Refusing to
offer it was right, but the replacement is **silence**: the Updates page now reads "up to date" while the
install sits behind stable with no way forward on its own channel. That is exactly what happened to the
add-ons channel for four of five entries, and only a manual manifest diff caught it.

**Scope:** for anything on beta, compare the installed version against the **stable** manifest entry as
well as its own. Where stable sorts higher, say so plainly — *"stable has 0.0.5; you're on 0.0.5-beta.1,
which is older. Switch this to stable to move forward."* Applies to JonDash itself, modules and helpers
alike. It is a **diagnostic, not an update offer** — it must not reintroduce BUG-31 by presenting a
cross-channel move as an update, since switching channel is a decision.

**Cost:** one extra manifest fetch per source for the other channel. `getModuleUpdateStatus` and
`getHelperUpdateStatus` already fetch per channel and cache for 3 minutes, so this fits the existing shape;
`lib/update.ts` would need the same for the app itself. **Whatever writes this must invalidate those caches
on a channel change — see BUG-37**, which was precisely that mistake.

#### OPS-11 · Update/restart grace screen + Server power — ✅ Shipped v1.3.6-beta.1 (released in v1.4.0)
_Catalog entry restored 2026-07-26: the ID was referenced in two places but had no entry of its own, so an
old reference didn't resolve. Reconstructed from the release commit and the v1.3.6-beta.1 changelog._

Applying an update or restarting now shows a **full-screen "please wait" cover** that waits for the server
to come *reliably* back before returning to sign-in — refreshing a half-started server no longer briefly
breaks remote access. It watches a lightweight health probe and reconnects on its own. Added **Restart &
Shut down** controls under Admin → **Server power** (full-admin only, both confirm first; after a shutdown
the dashboard can only be restarted from the server PC). An update or restart now **fully signs everyone
out**, restarting login from the password step rather than a leftover 2-factor prompt.

Later refined: an *intentional* restart keeps users signed in (v1.6.2) — shutdown remains the exception by
design. The grace screen is reused by the module install/update/remove restart path.

#### OPS-12 · Full server backup + selective restore — ✅ Shipped v1.3.7-beta.1 (released in v1.4.0)
_Catalog entry restored 2026-07-26: `docs/BUGS.md` cites OPS-12 as the fix for BUG-04, but the ID appeared
nowhere in this file. Reconstructed from the release commit and the v1.3.7-beta.1 changelog._

A backup saves the **entire server** in one file — accounts, service groups, access roles, every setting,
network/HTTPS configuration, icons, and (when encrypted) the encryption key. Setting a passphrase includes
sign-in credentials, 2FA secrets and email settings, making it a complete migratable backup; without one
those sensitive parts are left out. **Restore is selective** — pick which parts to bring back rather than
all-or-nothing.

Fixes **BUG-04**: restoring a backup used to break the authenticator, because TOTP secrets are encrypted
with the master key and a restore brought the secrets without it. An encrypted backup now carries the key.

Related later work: **BUG-25** (icons were left readable inside an "encrypted" backup — fixed
v1.5.3-beta.6) and **OPS-15** (publishing `docs/BUGS.md`).

#### OPS-13 · Email: bounded, diagnosable connection testing — ✅ Already satisfied (verified 2026-07-27)

**Scheduled into 1.8.0, then found to be already built.** The owner scoped it down on 2026-07-27 —
*"just going to relay the error that is received and provide that to the requester so they can
diagnose"* — and that is precisely what ships today:

- `sendTestEmail` (`lib/email/send.ts`) separates *couldn't connect* from *connected but the send was
  refused*, which are different fixes, and returns the **raw provider error verbatim** prefixed with
  the stage and the host/port actually used.
- `explainMailError` appends a cause where the error text is known to be misleading (a TLS-on-the-
  wrong-port mismatch, an untraceable certificate, a withdrawn refresh token, a relay refusing the
  recipient) — always *after* the raw text, never instead of it.
- The UI renders it with `white-space: pre-wrap`, without which the whole thing collapses into one
  run-on line and reads as a bare error code.
- BUG-21's original defect — a send that hung forever with no diagnosis — was fixed in v1.5.3-beta.1.

Nothing was built for this in 1.8.0. Recorded here so it is not scheduled a third time.

Original specification below.
BUG-21 is the hang; this is the reason a hang was possible to ship and impossible to act on. Fixing the
timeouts stops the button spinning forever, but the admin is then told only *that* it failed — for an
integration with this many external moving parts (OAuth consent, tenant policy, blocked ports, expired
refresh tokens) "failed" is not actionable. Scope:
- **Timeouts everywhere, as a rule not a patch** — every outbound call in the email path bounded
  (`AbortSignal.timeout()` on the token fetch; `connectionTimeout`/`greetingTimeout`/`socketTimeout` on
  both transports). Audit the *other* outbound paths for the same omission at the same time: ACME/TLS,
  the update check, and the module source/manifest fetch.
- **Say which step failed** — token fetch / TCP connect / TLS / SMTP AUTH / send. `transport.verify()`
  before `sendMail` separates "can't connect or authenticate" from "connected but the send was
  rejected", which are entirely different fixes for the admin.
- **Name the known provider traps in the failure message**, since they're the common causes: M365 has
  **SMTP AUTH disabled by default** per mailbox; Google needs an app password unless using OAuth2; a
  refresh token can be revoked without warning; outbound 587 is often blocked on home connections.
- **Never let the UI wait unbounded** — the button needs its own ceiling and a "still working…" state,
  so a hung Server Action can't present as a frozen page.
- **Then re-test the real M365 account** (the owner's; needs their tenant) — the point is a truthful
  error, not merely a fast one.

**Largely delivered across v1.5.3-beta.1 (timeouts, step separation, provider traps) and
v1.5.3-beta.2 (the diagnosis half).** What the real-account test on 2026-07-23 exposed, and what
beta.2 fixed:
- **The failure never said what it connected to.** The test button uses the *saved* config, not the
  form — so `unable to get local issuer certificate` gave no way to tell whether it had even used the
  host on screen. It now reports host, port, TLS mode and how it authenticated, on success and
  failure. The owner's audit log showed a stale `:80` host saved a day earlier, which is exactly the
  case this makes visible.
- **New explanations:** untrusted / self-signed / expired / wrong-hostname certificates; a server
  offering no AUTH; a relay refusing the recipient; and `wrong version number`, which is only ever
  "Use TLS on connect" ticked for a port that expects plain SMTP first.
- **The explanations were invisible anyway** — each is `error\n\nwhat to do`, and HTML collapsed it to
  one line, so even the beta.1 guidance never reached the admin. `white-space: pre-wrap`.
- **Relay support (new).** An IP-authorised relay advertises no AUTH; JonDash required an account and
  offered credentials regardless. New `relay` mode sends none. Plus an opt-in, off-by-default
  `allowUntrustedCert` for a private-CA smarthost — scoped to the mail transport only (never the
  global TLS switch), audited on enable, and echoed in every result so it can't be forgotten.

**Still open here:** the UI has no ceiling of its own — a hung Server Action still presents as a
spinning button. The transport timeouts bound it in practice, but that's the server being
well-behaved, not the UI defending itself.

#### OPS-15 · Publish the bug tracker + security reviews — 🌅 Someday
Bring the full defect list, and refreshed security reporting, into the public repo alongside the roadmap and
changelog that are already published.

**Deliberately not done yet — a considered position, not an oversight.** JonDash is self-hosted and updates
on each owner's schedule, so a public list of *unfixed* findings tells an attacker exactly what to try
against every install that hasn't updated — including installs whose owners will never read this repo. The
roadmap and changelog carry no such risk, which is why they are public today.

**What has to be true before publishing:**
- Open findings are fixed and released, or judged not exploitable and documented as such.
- There is a disclosure route for anyone reporting a new issue (a `SECURITY.md` with a contact and an
  expected response), so publishing invites reports rather than only handing out targets.
- Something owns the gap between "fixed here" and "updated everywhere" — at minimum, a finding is published
  only after a stable release carrying its fix.

Until then the tracker stays local, and `docs/SECURITY-REVIEW.md` remains what it is: a dated report of the
review as it stood, with findings marked fixed as later releases address them.

### CORE — Core app & UX

_CORE-01 ("No / low recovery codes" reminder) is **retired** — dropped by the owner 2026-07-22. See the
Retired IDs table in the build queue._

#### OPS-19 · Run JonDash on Linux — ⏳ Planned (owner request 2026-07-25)
JonDash is a **Windows product today** and nothing on this roadmap said so. The server itself is close to
portable — `supervise.mjs` spawns via `process.execPath`, and `@node-rs/argon2`, `sharp` and
`@prisma/client` all have Linux builds through npm. What is Windows-only is everything *around* it.

**The blockers, all found by inspection 2026-07-25:**
- **There is no launcher.** `start-dashboard.bat` is not a convenience wrapper — it owns already-running
  detection, the update check, and the `_run` relaunch loop that implements the supervisor's exit codes
  (10 update · 11 revert · 12 boot-crash · 13 rebuild). A `.sh` must mirror that **contract**, not just
  run `node`. Without it there is no auto-update, no crash-revert and no rebuild-after-module-install.
- **The updater shells out to PowerShell** — `scripts/update.mjs:211` extracts with `Expand-Archive`.
  **Easy fix: `fflate` is already a dependency** (the backup zips use it), so `unzipSync` replaces it with
  no new package and makes the path portable on both platforms.
- **Privileged ports.** Let's Encrypt binds 80/443; on Linux that needs root or `CAP_NET_BIND_SERVICE`.
  Decide between `setcap`, a reverse proxy, or a high port plus redirect — and say which in the docs.
- **Case-sensitive filesystem.** Windows hides import-casing mistakes; a full build/test pass on Linux is
  the only way to find them.
- **Windows-only UI hints** — the BYO-cert page suggests `C:\certs\fullchain.pem`. Make it platform-aware.
- Consider a **systemd unit** as the supervisor rather than a foreground script, since that is how a
  Linux user would actually expect to run it.

**Position not set by the owner** — move it freely. **Related:** OPS-18's Linux half is being built ahead
of this and cannot be verified end-to-end until this lands.

#### OPS-18 · Elevation binaries (`jondash-grant`, and later the elevate shim) — ⏳ Planned (2026-07-25)
Requested by the add-ons session; blocks the `host-services` helper now and `host-install` later. The
shared design is `JonDash-addons/helpers/ELEVATION.md` and is accepted as written.

**Why this is core's and not an add-on's:** the UAC prompt names *the binary being elevated*, and its
publisher. That makes it a packaging concern — a helper can spawn a process, but it cannot make Windows
say "JonDash" in the consent dialog. Once the binary exists at a known path, helpers just invoke it.

**The governing rule (owner, 2026-07-25):** *a fixed action can be granted once; a variable action must be
approved every time.* A standing privileged daemon was proposed and rejected — nothing may be permanently
root and listening so that a button can restart Plex.

- **Part 1 — the grant manager** (`jondash-grant`), the actual blocker. Creates/removes **one OS-level
  grant per fixed action**: a Scheduled Task with "run with highest privileges" on Windows, sudoers
  NOPASSWD or polkit on Linux. Windows first.
- **The non-negotiable:** a granted action is **fully self-contained** and never reads what to do from a
  file or any other mutable source. A task running a fixed `sc.exe stop "Plex"` is a narrow permanent
  capability; a task running `pending.bat` is local privilege escalation for every process on the box,
  because the unprivileged app can write that file. `schtasks /run` cannot pass arguments, which is what
  makes the fixed-command form enforceable by Windows rather than by convention.
- **Part 2 — the elevate shim**, later, only for `host-install`. Structured action + result path, launched
  with `runas` so UAC prompts each time; writes `{ok, exitCode, output, error}` and must distinguish
  **declined at UAC** from **action failed**.
- **Both refuse rather than degrade** in Session 0 / a container / headless. Note the asymmetry: *creating*
  a grant needs an interactive desktop; *using* one does not — which is what makes unattended automation
  work afterwards.
- **Code signing: ships unsigned, tracked separately** (owner decision 2026-07-25). JonDash signs nothing
  today, so Windows shows "Unknown publisher" on the prompt. That gets **documented honestly rather than
  worked around**, and JonDash's own consent screen — which shows the exact command verbatim — carries the
  real consent. Signing is worth doing and does **not** block this.
**Contract SETTLED with the add-ons session 2026-07-25 — build to this, it is no longer open:**
- **Task names are readable, not opaque.** `JonDash\Plex-restart`, not `JonDash\svc_a7f3-restart`. An
  opaque id would be immune to anything derived from the service name, but it forfeits the property that
  justifies the whole design: *the admin can open Task Scheduler and read exactly what JonDash may do
  unprompted.* Their call, and it's the right one.
- **Safety comes from the charset instead:** `[A-Za-z0-9._-]`, max 64 chars, numeric suffix on collision,
  one task per verb, and the **display label never appears in a task name** — so relabelling an entry
  never touches the OS, and a label containing a backslash cannot reach the task path.
- **Two independent layers, and neither may be removed because the other exists.** Their sanitising is a
  path-escape defence (backslash is the folder separator, so this is not tidiness); core's *refuse
  anything outside `JonDash\`* is the second. Defence in depth, explicitly agreed on both sides.
- **Core owes them one thing: populate the task's `Description` field** — *"added by &lt;admin&gt; on
  &lt;date&gt; for the service-control module"*. Cheap, and it turns the Task Scheduler view from a list
  of names into a real audit trail, which is the thing this design claims over a daemon.
  **Implementation note:** the label is operator-supplied text, so if the task is registered via generated
  XML it must be XML-escaped — otherwise a label containing `</Description>` breaks the registration.
- **Batching: one UAC prompt per ENTRY, not per grant** (their decision). Adding a service creates its
  start, stop and restart grants behind a single prompt — three prompts would train the admin to click
  through them, which is the habituation ELEVATION.md warns about, and prompts two and three carry no new
  information. The decision actually being made is *"may JonDash control this service"*. Arguments only;
  `--create-from <file>` stays forbidden.
**Windows AND Linux — owner requirement, 2026-07-25. They need DIFFERENT SHAPES, and that is forced by
the platforms, not by convenience:**

- **Windows needs a compiled binary, and that is the whole reason this is core's job.** UAC displays the
  *executable's* name and publisher, so the thing being elevated must be ours and must be named. A ~7 KB
  C# binary built with the `csc.exe` already inside every Windows install (`C:\Windows\Microsoft.NET\
  Framework64\v4.0.30319\csc.exe`) — no SDK for us, no runtime for the user. **Proven by a spike**: 6,656
  bytes, connects to Task Scheduler over COM, reports its own elevation state correctly.
- **Linux needs no binary at all.** There is no UAC; a "grant" is a **text file written by root** — a
  `NOPASSWD` line in `/etc/sudoers.d/` or a polkit `.policy`. The prompt comes from `sudo`/`pkexec` and
  names the *command*, not our tool. So Linux ships a plain Node script (JonDash already requires Node) —
  no toolchain, no committed binary, and **auditable by the admin before they run it under sudo**, which
  is strictly better for a privileged tool.

**The trap that decides the Windows shape — the logic must be COMPILED IN, not read from disk.** A tiny
shim that elevates and then runs a script from the install directory is *exactly* the escalation rule 3
forbids: the unprivileged app can rewrite that script, so anything that can write it gets SYSTEM. This
also rules out shipping Node as the Windows privileged path — and elevating `node.exe` would show
"Node.js JavaScript Runtime" in the prompt, the same anti-pattern as elevating `powershell.exe`.

**Why the same trap does not apply to Linux.** Creating a grant there is a one-time interactive act — the
admin types `sudo jondash-grant --create …` themselves, so a readable script is no worse than them typing
the sudoers line by hand, which is the bar ELEVATION.md sets. **The tool itself must never get a NOPASSWD
rule**; only the fixed target command does.

- **Divergence is the real risk, so it gets a shared conformance suite.** The safety logic — verb grammar,
  name sanitising, namespace refusal, exit codes, environment detection — is most of the risk surface and
  now exists twice. Both implementations must pass the same test vectors: same input → same sanitised
  name, same refusals, same exit codes.
- **Committed binary weight: ~7 KB** (Windows only). The updater fetches the git tag archive and has no
  path to a GitHub Release asset, so anything shipped must be in the repo — which is why size drove the
  choice. Alternatives measured: .NET self-contained ≈ 15 MB, Node SEA ≈ 60–90 MB, Go ≈ 2 MB per target.
**SECURITY — a real vulnerability found and fixed during the build, 2026-07-25.** Prompted by the owner
asking *"could someone replace the file with a malicious one of the same name… or can you pin it by hash?"*
Three findings, in order of severity:

1. **FOLDER SQUATTING — critical, would have defeated the whole design.** Measured, not theorised: an
   **unprivileged** user can create a Task Scheduler folder, and Windows grants the creator
   `(A;ID;FA;;;<their SID>)` plus `(A;OICIIOID;FA;;;CO)` — CREATOR OWNER, full access, **inherited by
   children**. So an attacker, or a compromised JonDash (which runs unprivileged), could pre-create
   `\JonDash\` *before the first grant existed*. Grants would then be registered into a folder they own,
   the inheritable ACE would flow onto the task, and they could rewrite `net.exe stop Plex` into anything
   — running as **SYSTEM**. Full local privilege escalation.
   **Fixed two ways, both needed:** the task/folder DACL is now `D:P(...)` — the **`P` marks it protected
   and blocks all inherited ACEs** — and `EnsureFolder` **always re-stamps the descriptor**, whether it
   created the folder or found one, which it can do because it is elevated at that moment. Pre-creating
   the folder therefore gains an attacker nothing.
2. **DLL search-order hijack — fixed.** Task actions had no `WorkingDirectory`, so the child could start
   in an attacker-writable directory. `net.exe` would be genuine; the DLLs beside it might not. Both
   actions now pin `WorkingDirectory` to System32.
3. **Hash-pinning the executable: not possible, and not needed.** Task Scheduler has no hash field — it
   resolves the path at run time. But `C:\Windows\System32\net.exe` is owned by `NT SERVICE\TrustedInstaller`,
   the **only** identity with write access (verified; an unprivileged write was denied). Replacing it
   already requires the privilege this scheme protects. **Pinning to System32 is the hash pin in
   threat-model terms** — and pinning to a *JonDash* binary would be strictly worse, because the install
   directory **is** unprivileged-writable (also verified), so a compromised app could swap the very binary
   doing the checking. True hash/publisher enforcement is WDAC or AppLocker: machine-wide OS policy, out
   of scope for JonDash to configure.

**Still unverified — both need a task to exist, so they are the manual pass:** that the descriptor really
does stop a standard user *editing* a task (they must be able to run, not change — this is the single most
important assertion in the design), and that a standard user cannot add their own task inside `\JonDash\`
once the folder carries the protected DACL.

**LIFETIME — persistent, owner decision 2026-07-25** (*"persistent, as long as it's secure"*). A grant
survives until explicitly removed, so one approval covers "may JonDash control this service" and
unattended automation works. `--once` remains available per entry for callers that want a self-deleting
grant.

**REMOVAL — owner requirement, 2026-07-25: *"when the module is removed, I don't want a random task
present."*** A grant is elevated and survives restarts, so nothing may outlive the thing that justified
it. Four exits, and all four must work:
1. **Entry deleted in JonDash** → `--remove --service <name>` drops that entry's grants. Already the
   contract ("removing an entry removes its grant, in the same action" — ELEVATION.md rule 4).
2. **The consuming module is uninstalled** → the helper drops the entries that module owned. Helper-side
   logic, but it needs core's module-uninstall path to actually call it — **an integration point that
   does not exist yet, and the most likely place for an orphan to appear.**
3. **The `host-services` helper is uninstalled** → `--remove --all`: every grant plus the `\JonDash\`
   folder itself.
4. **JonDash is uninstalled** → same `--remove --all`. Requires elevation, so it cannot be silent; if the
   admin declines, they must be told plainly that grants remain and how to remove them by hand.

**Orphans are still possible** and should be assumed rather than designed away: a grant outlives an
uninstall that skipped the prompt, or a machine restored from a backup. `--list` reads from the OS
precisely so the truth can be compared against JonDash's own record, and the admin can always delete a
task in Task Scheduler directly — that visibility is the thing this design claims over a daemon.

**`--once` implemented** (2026-07-25): the grant deletes itself as its final action, so nothing survives
the single use it was approved for. Still self-contained — a fixed command naming a fixed task — so it
does not reopen the mutable-source hole. **Opt-in, not the default** (see LIFETIME above): a self-deleting
grant cannot serve unattended automation, which is the case ELEVATION.md calls out (*"a health check that
restarts a hung service cannot wait for a human"*), and re-granting costs another UAC prompt each time.

- **WINDOWS ONLY for now — owner decision, 2026-07-25.** The Linux half is designed above but deliberately
  **not built**: JonDash has no Linux launcher (**OPS-19**), so the helper that would call it cannot run
  there, and the code could not be verified end-to-end. Building it would mean committing untested code
  for an unreachable platform. Revisit once OPS-19 lands; the design above stands and does not need
  re-deriving.
- The add-ons session is **blocked on this only for its integration test**; their allowlist and spec
  proceed without it.

#### CORE-10 · Admin → Permissions, and a declarative capability contract — ✅ Shipped v1.7.2-beta.1 (2026-07-26)
Owner's proposal, handed to core to own. Fold **Admin → Helpers** into the modules page, and add a
new **Admin → Permissions** listing every module against its capabilities as switches.

**The design is right, and each point earns its place:**
- **Grants are per (module, capability), never per helper.** A helper-level switch would silently
  widen *every* module that declared that helper, including ones installed earlier for unrelated
  reasons. The helper switch is the **ceiling**; each module holds its own grant inside it.
- **Both axes are needed.** *"Which modules can restart services"* / *"which can read my files"* is
  the view that catches trouble, and it cannot be reconstructed by clicking through modules one at
  a time.
- **Switches and per-item sets belong on ONE screen.** "Manage services" is a boolean; *which*
  services is a set, as are approved paths. Splitting them puts the control that bounds a
  capability somewhere other than where the admin looks — **which is precisely the bug just fixed
  in host-services**. This is the load-bearing point, not a layout preference.
- **Helpers are not peers of modules on the merged page.** They cannot be installed or removed by
  hand, so a flat list implies a control that does not exist. Same page, separate sections.

**The blocker, and it is core's:** for core to render permissions for *any* helper, helpers must
declare their capabilities and per-item scopes in a shape core can drive. Today each ships a
bespoke panel it wrote itself. **That contract is the bulk of the work.** Core owns it — it is a
core type core must render generically, and a contract designed without real consumers gets
rewritten twice. Shape it against the three helpers that exist (`host-services`, `filesystem`,
`host-install`) rather than in the abstract.

**MIGRATION TURNED OUT NOT TO BITE — the contract dissolved it.** The worry was that approved
services live as **Scheduled Tasks outside the database**, so a UI backed only by DB state would
show nothing while those grants kept working. But `scope.list()` is answered by the *helper*, and
`host-services` answers it from Windows via `--list`. So the page renders whatever the OS actually
holds, with no DB copy to migrate and nothing to drift. Worth remembering as a shape: delegating
the read to the component that owns the truth removed a migration entirely.

**Owner decision on the filesystem question, 2026-07-26 — my proposal was overruled, and the
record should say so.** I argued that JonDash's own `.data/`, `prisma/` and `bin/` should be a fixed
carve-out no module could ever be granted. The owner decided the opposite: *"1 yes, give it a
warning."* "Allow everything" means everything, **and the `unbounded.warning` must name what that
reaches** — the master encryption key, the database, the elevation binaries.

The reasoning is better than mine was. A carve-out makes the switch grant *less* than the words on
screen, which is its own dishonesty, and it invites a module author to discover the boundary by
hitting it rather than reading it. The control is the sentence the admin reads before agreeing, so
that sentence has to be the whole truth. Recorded as rule 10 in `docs/HELPERS-DESIGN.md`.

**Second owner decision, same day: read and write are always separate capabilities** — *"just
ensure with all of it, there is a read only and full options."* A capability spanning both forces
the admin to grant the destructive half to get the harmless one. Core cannot enforce it (it never
sees the verbs), so it is a contract obligation on helper authors — rule 9.

**What shipped.** Both axes; per (module, capability) switches; the bounding set on the same card;
a browse picker so nobody types service names by hand; opt-in `unbounded` (confirm on, immediate
off); `itemToggle` for per-entry settings like "may act without asking", requested by the add-ons
session so it wouldn't need a `SettingsPanel` for one boolean. Helpers merged into **Addons** as
"Shared capabilities"; `/admin/helpers` redirects. Enforcement needed no new code — `ctx.can()`
already reads stored grants.

#### CORE-11 · One dashboard — service tiles and module widgets in the same arrangeable grid — ✅ Shipped v1.8.0-beta.5 (2026-07-27)

**Shipped, and then went further than this entry describes.** One grid, one arrangement across both
kinds, stored in `DashboardLayout` (`ModuleLayout` renamed — it stopped being about modules) keyed by
`kind` + `refId` so one arrangement spans two tables.

The "one ordering" this entry specifies survived only three betas: **v1.8.0-beta.13 replaced ordering
with free placement** — an explicit column and row per item, so a tile can sit anywhere with gaps
around it. The owner asked for it directly after using the ordering version: *"I want to be able to
arrange the grid in any way I want… one icon at the top, and one at the bottom, not directly next to
each other."*

**A user's arrangement is never written to `Link.sortOrder`** — a role tile is shared by every member
of its Service Group, so writing one person's layout there would reorder everybody's dashboard.

Original specification below.

Merge the service-tile grid and the module-widget grid so everything on the dashboard is arranged
together, in one ordering.

**This reverses a retired decision, deliberately.** MOD-04 ("arrangeable dashboard, core tiles too")
was dropped by the owner on 2026-07-22, with the note that arranging core service tiles was not
wanted. Asked for again on 2026-07-27 after using the reworked arrange mode. Retired IDs are never
reused, hence a new one.

**The hard part is not the dragging.** A service tile and a module widget are different objects: a
tile is small, fixed-size and iconic, with its own `sortOrder` on `Link`; a widget is 1–3 grid cells
and renders arbitrary module content, ordered by `ModuleLayout`. One grid means one ordering across
two tables, and deciding whether a tile can be resized like a widget or stays a fixed unit.

#### CORE-12 · A separate saved dashboard layout per device — ✅ Shipped v1.8.0-beta.5 (2026-07-27)

**Shipped as specified, keyed on the viewport.** `DashboardLayout.profile` is `wide` (≥1024px) or
`narrow`, the client states which it is saving, and the boundary is defined once in
`dashboard-grid.tsx` so it cannot drift from the grid's own breakpoint.

**The write reads the viewport at save time rather than trusting component state** — belt and braces,
because a missed media-query event would file an arrangement against the *other* device, which is
precisely what this feature exists to prevent.

**Honest limit:** the server cannot see the viewport, so it renders `wide` and a narrow client
corrects on mount. Both profiles start identical, so the reflow only appears once someone has
deliberately made them differ.

The "arrange affordances for a phone" half below was overtaken: dragging now works on touch
(v1.8.0-beta.11), and the ← → buttons it refers to were **removed entirely** in v1.8.0-beta.15 at the
owner's request, free placement having made them a dozen clicks to do what one drag does.

Original specification below.

Rearranging the dashboard on a phone must not reorder it on the PC. Today `ModuleLayout` is per-user
only, so the two fight.

**Key it on VIEWPORT, not user agent.** The owner suggested UA; viewport is the better signal because
it is what actually decides which layout renders. A UA check gets it wrong for a desktop window
resized narrow — mobile grid, desktop arrangement — is ambiguous for tablets, and UA strings are
neither stable nor trustworthy. Proposal: `ModuleLayout` gains a `profile` column, `narrow` (the
1-column grid) and `wide` (2–3 columns), with the client stating which it is saving. Rotation and
window resizing then land in the right profile on their own.

**Also in scope: arranging on a phone is currently impractical.** At one column, width is meaningless
and the ← → move buttons mean up/down — the narrow layout needs its own arrange affordances rather
than the desktop ones shrunk.

#### CORE-14 · The dashboard uses the screen it is given — ✅ Shipped v1.8.0-beta.5 (2026-07-27)

**Shipped without removing the reading measure globally.** A page marks itself `data-wide-page` and
the shell widens around it via `:has()`; the header widens with it, or the brand and account menu
would sit in a narrow column above a full-width page and read as misalignment.

The cap is right for prose and forms and wrong for a grid of tiles — a 2000px-wide settings form
would have been worse than the problem being fixed, so only the dashboard opts out.

Original specification below.

`app/(app)/layout.tsx` caps every page at `max-w-6xl` (1152px) and centres it. On a wide display the
dashboard is squeezed into the middle third with a large empty margin either side — reported with a
screenshot on a ~2000px screen.

**The cap is correct for reading and wrong for a dashboard.** A 72rem measure is what keeps prose and
forms at a legible line length; a grid of tiles has no equivalent constraint and simply wants the
room. Removing it globally would make a 2000px-wide settings form worse than the problem being
solved — so the dashboard runs wide while text and form pages keep their measure.

**Pairs with CORE-11.** The owner's report — *"modules only appear in the middle of the screen, and
should be completely optional about where they are placed"* — is one complaint with two causes: the
container is too narrow, and placement is not free. Fixing either alone leaves it half solved.

#### CORE-13 · Drop the free-form accent colour; ship many more palettes — ⏳ Planned (owner request 2026-07-27)
Remove Modern's arbitrary hex accent (`branding.accent`) and replace the choice with a much larger
set of designed palettes.

**Why it's the right trade:** a palette is a *designed* set — accent, ring, danger, warning, success,
surfaces — checked for contrast against its style. A lone hex dropped into that can clash with every
other colour in the style and there is nothing to stop it; the setting offered freedom the design
system could not honour.

**Decide at build time:** what happens to an install that has a custom accent set. Ignoring the
stored value is simplest, but it changes how their app looks the moment they update, which is
user-visible and needs saying plainly in the release notes rather than being discovered.

#### CORE-09 · Modules page: search, filter, and a compact list — ⏳ Planned (owner request 2026-07-26)
The page renders every module as a full card, which was fine when there were two and is already
unwieldy now that there are several. It only gets worse as more ship.

- **Search** by name and description.
- **Filtering** — at least enabled/disabled and installed/available; settle the rest when building.
- **A compact list by default, with a way to expand.** Owner: *"in a list, rather than a full list
  taking up a lot of room."* The per-module detail (description, permissions, version, buttons)
  moves behind expanding a row rather than being permanently on screen for everything.

**Deliberately not urgent** — the owner said *"lets do that later"*. Position is open.

**Watch on the way through:** the permissions block is currently always visible on every card, and
that visibility is a security property rather than decoration — an admin can see at a glance what
each module can do. Hiding it behind an expander is reasonable; hiding it *by accident* while
making the page tidier is not. Whatever the collapsed row shows, a module holding a dangerous
permission should still be identifiable without expanding it.

#### CORE-08 · Dashboard widget interaction rework — ✅ Shipped v1.8.0-beta.1 (2026-07-27)

**Shipped as specified.** Arranging is an explicit mode (`Arrange` / `Done arranging`) rather than
chrome revealed on hover — hover cannot happen on a touch screen, and the old cluster sat exactly
where a module puts its own affordance. Normally the whole widget is a click target opening the
module's page, with a real focusable `sr-only` link beside it because a container `onClick` is
invisible to a keyboard and a screen reader. Edit mode carries move buttons, a size readout, Reset,
and a corner handle that resizes by pointer drag **or arrow key**. A module shipping no `Page` gets
`href: null` and is correctly not clickable. Hover lift moved behind
`@media (hover: hover) and (pointer: fine)`.

Cell geometry for the drag is **measured from the live grid** rather than duplicated as a constant —
the column count changes with the breakpoint and the row height comes from `auto-rows`, so a copy
here would silently disagree with the CSS the first time either moved.

Closed **BUG-53** (chrome no longer exists in normal use), **BUG-54** and **BUG-55**. Original
specification below.
Owner feedback after using the drag-and-drop dashboard: the arranging works, the *interaction model*
doesn't. Controls are hover-revealed (so they don't exist on touch), they overlap widget content, and the
widget itself isn't clickable. The fix is a mode, not more buttons.

- **Clicking the widget opens the module.** The separate "Open" button goes away — it's redundant when the
  whole card is the target, and it's the thing currently colliding with the controls (**BUG-53**).
- **Hover gives a light highlight on pointer devices**, drawn from the current style/palette tokens so it
  reads correctly in every style (CORE-07) — no hardcoded hover colour. Pointer-only, via
  `@media (hover: hover)`, so touch doesn't get a stuck hover state.
- **Move appears only in edit mode, as a real button.** Today the grip is hover-revealed, which means
  **it does not exist on a phone**. Edit mode must expose move as a tappable control, not a hover affordance.
- **Resize becomes edit → drag the corners → save**, replacing the 1/2/3 width and height buttons. This
  also has to fix **BUG-54** (height does nothing, because the grid has no row track) and **BUG-55**
  (widgets aren't a uniform size) — a drag handle is meaningless while the underlying size can't change.
- **Explicit save.** Resizing commits on save rather than per-drag, so an experiment can be abandoned.

**Depends on / supersedes:** BUG-53, BUG-54, BUG-55 — all three are symptoms of this design and should be
closed by it, not patched first. **Do after CORE-07 ships**, so the hover highlight and edit chrome are
built against the finished token set.

#### CORE-07 · Selectable interface styles — ⏳ Planned (direction set 2026-07-25)
Owner decision, 2026-07-25: the UI rework is **not one new look — it's a chooser**. The app ships several
distinct *styles* and the operator picks one, with more added over time. Named wants so far: **XP**,
**Windows 7 (Aero)**, **Crystal** (Apple "liquid glass"), and others later.

This reframes CORE-04: instead of agreeing a single visual direction, build the **mechanism** plus a couple
of styles, and let taste be a setting rather than an argument.

- **Build order (owner):** the selection mechanism plus **1–2 styles** first, so more can be designed later
  without touching the app.
- **Methodology is a deliverable, not a side-effect.** How a style is defined, what it may and may not
  change, and the accessibility floor it must clear are written down in **`docs/STYLES.md`** so later
  styles are consistent and can be built without re-deriving the rules.
- **The hard constraint: installed modules must look right in every style.** Modules are third-party code
  using the same primitives, so a style may only redefine the shared design tokens — never per-page or
  per-component rules a module can't know about. This is what makes styles safe rather than a source of
  "module X looks broken in style Y".
- **Every style must stay usable**, not just pretty: contrast floor, a visible keyboard focus ring, and no
  loss of hit-target size. A style that fails those isn't shipped.
- **Interaction with CORE-06:** the accent colour and logo are the operator's *brand*; a style is the
  *chrome*. They compose — an accent must work in every style.

#### CORE-06 · Rebranding / white-labelling — ⏳ Planned
Owner request, 2026-07-25. Let the operator make the instance their own — three parts:
- **Colour scheme.** Change the app's colours from the default. The UI is already themed through CSS
  variables (`--primary`, `--background`, `--surface-2`, …), so the hook exists; this is a settings surface
  over it (a few presets and/or a custom accent), applied instance-wide and working in both light and dark.
- **Custom logo.** Upload a logo to replace the "J" mark / wordmark in the header (and the favicon / PWA
  icon where it appears). Reuse the hardened icon-upload path (`lib/security/upload.ts` — sharp, stored
  outside the web root, size-checked), not a new one.
- **Rename from "JonDash".** A custom app name used wherever the name shows — the header, page `<title>`s,
  the PWA manifest, and outgoing email. **Watch the TOTP issuer:** the authenticator label is currently
  "JonDash"; changing it only affects *new* enrolments (the shared secret is unchanged, so existing codes
  keep working), but it's the one place a rename is more than cosmetic and should be flagged to the admin.

**Scope notes for when it's built:**
- **Instance-wide, admin-set** — the operator branding the whole install, not a per-user theme.
- **Stored in the Setting store** like other settings, with the defaults as the fallback so a fresh install
  is still recognisably JonDash until changed.
- **Build it with CORE-04 (full UI rework) in view** — the theming system and the rework touch the same
  surface; agree the direction once rather than restyling twice.
- **No phoning home / no external assets** — same principle as CORE-05: branding is local; nothing fetches
  a remote logo or theme.

#### CORE-05 · "Buy me a coffee" banner + a support page — ✅ Shipped v1.8.0-beta.24
**Shipped as three pieces, deliberately unequal.** A permanently visible, deliberately quiet
**Help & support** line at the foot of every screen (no card, no colour, the same weight as the
version number beside it); a **Help & support** entry in the settings nav **directly below General**,
at the owner's request — help is what you reach for when something is wrong, and hunting past nine
sections of settings is the moment it is least wanted; and the tinted banner, which **appears only
once the install is a week old** and never returns once dismissed.

`/help-meeeee` (five `e`s, per the locked decision below) and `/you-are-a-bloody-legend` both exist.
The thank-you page stores nothing, checks nothing and is reachable by anyone who types it — a
self-hosted box behind a home router cannot receive a payment webhook, so anything else would be
theatre. A test pins the route spelling, the week-long delay, and that nothing is gated behind
supporting.

The heart is drawn with `currentColor` from the appearance tokens, so it takes the viewer's palette
in all seven styles rather than looking pasted in from another website.

`SUPPORT_URL` in `app/components/support.tsx` carries the owner's real link (supplied 2026-07-29).

*Original scope below.* Owner request, 2026-07-24. A **small** banner offering to support the project with a coffee, linking to
a support page that is deliberately a bit cute and funny. Someone who goes on to support gets a second,
sillier thank-you page.

**The routes are the joke, and they are exact.** Locked by the owner — do not tidy, shorten or
"correct" the spelling later:
- `/help-meeeee` — the support page. **Five `e`s.** The owner first wrote `help-meeee` (four) and then
  said *"I want the address of the page that you enter to specifically be help-meeeee"*; the second,
  emphasised spelling wins. **Confirm before building** — it is one character and it is the whole gag.
- `/you-are-a-bloody-legend` — the thank-you page, reached after supporting.

**Tone:** cute and funny, and still recognisably JonDash. The app is otherwise dry and
infrastructural — a self-hosted dashboard that guards someone's services — so the humour lives on these
two pages and in the banner copy, not in the admin UI around them.

**Design constraints that matter more than the styling:**
- **The banner must never nag.** Dismissible, and once dismissed it stays dismissed — per user, stored
  the same way other per-user UI state is. A self-hosted personal-use app that pesters its owner for
  money is worse than no banner at all. Consider showing it only after the instance has been in use for
  a while, rather than to someone who just finished setup.
- **Nothing is gated behind it, ever.** No feature, no nag-removal-for-payers, no "supporter" tier. The
  licence is personal-use and free; this asks, it does not sell.
- **`/you-are-a-bloody-legend` cannot verify that anyone actually paid** — and should not pretend to.
  A payment provider only confirms a payment via a webhook, which a self-hosted instance behind
  somebody's home router generally cannot receive. So treat it as the **return URL** the provider sends
  people back to: a thank-you, reachable by anyone who types it, storing nothing and asserting nothing.
  Do not build an entitlement on top of it.
- **No phoning home.** The banner must not fetch anything external to decide whether to render, and the
  pages must not embed a third-party script or tracker. Clicking through to the payment provider is
  user-initiated and fine; anything before that click is not.
- **Both pages are public-ish by nature** — they sit behind the normal sign-in like everything else, but
  keep them free of instance detail (no hostnames, no service names, nothing from the dashboard).

**Open, for the owner:** which payment provider (Ko-fi / Buy Me a Coffee / GitHub Sponsors / plain
PayPal), and whether the banner appears on the dashboard, in the admin area, or both.

#### CORE-04 · Full UI rework (with CORE-06 rebranding) — ⏳ Planned — direction to agree first
Owner decision 2026-07-23; **being built together with CORE-06 (rebranding) as one effort, owner decision
2026-07-25 — this is now the active work, ahead of SEC-04.** **The look changes significantly; the
functionality does not.** Buttons, controls and flows stay as they are — this is a visual pass, not a
re-architecture, and nothing here should become a reason to move or remove a control someone relies on.

**Concrete scope added 2026-07-25 (owner):**
- **Drag-and-drop module widgets.** Let a user drag their dashboard module widgets to different positions.
  Per-user widget sizing + ordering already exists (v1.4.0 — stored in `ModuleLayout`: width, height,
  sortOrder); this adds direct drag-and-drop over that, persisting to the same store.
- **Replace the "customize" section with a small edit (pencil) icon.** Size options move inside it, so the
  dashboard stays clean until you choose to edit it, instead of showing a customize panel.
- **Mobile nav → hamburger.** On mobile, replace the admin **Menu ▾** dropdown (`app/admin/admin-nav.tsx`)
  with a hamburger that slides a panel out from the left; pick an option and it hides again.
- **Rebranding (CORE-06)** — colour scheme, custom logo, rename — folded in, since it touches the same
  theming surface.

**Still: agree the direction before mass-applying.** A half-applied restyle across ~20 admin pages is worse
than either look. UI-heavy → **preview/mockup first** (feature-build-workflow), and build in phases.

Worth carrying into it when it is scoped:
- **Mobile/responsive is already an ongoing commitment** (moved from CORE-03) — fold it in rather than
  treating it as separate work afterwards. The hamburger above is part of this.
- **Consolidation beats restyling.** The Updates page work (2026-07-23) showed the real problem wasn't
  how a control looked but that update settings lived in four places. Look for the same pattern
  elsewhere before repainting.
- **Test with data present.** Every UI regression found so far — the trapped overlays (BUG-23), the
  invisible import button (BUG-22), the render-prop 500 — passed a clean build and an empty state.

#### CORE-02 · Admin area → "Settings" with a left sidebar + grouped sections — ✅ Shipped v1.3.3-beta.1, released in v1.4.0
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

## Locked decisions

1. **Modules are curated or self-built — permanently.** Anyone may write a module and import it, and any
   public repo can be added as a source, but there is **no sandbox**: the install-time verifier plus
   permission consent is the whole security model, and hardened sandboxing for untrusted authors was
   considered and dropped (retired MOD-06, 2026-07-22). "Only install modules you trust" is a standing
   condition of the design, not a caveat awaiting a fix. Say so plainly wherever it comes up.
2. **Module manifest:** hosted in-repo (`addons.json` per channel branch); versions and tags per add-on.
3. **Trusted-IP auto-login:** off by default for everyone; **admins never** eligible as targets; users
   opt in with a recorded disclaimer; external IPs need the stronger warning + typed confirmation.
4. **First audience:** owner only for now; public/multi-user hardening deferred.
5. **Deployment:** current basis is the Windows launcher; eventual target is a bootable VHD appliance.

_Superseded: the old GeoIP decision went with **SEC-03** when country-based policy was dropped
(2026-07-21)._
