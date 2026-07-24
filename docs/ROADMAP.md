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

**Nothing is in flight.** MOD-09 and MOD-10 both shipped in **v1.5.2**. The next module-platform item is
**MOD-11** — making helper capability checks enforcement rather than advice — worth doing before
helper-side enforcement spreads across several helpers.

Otherwise this list is only what's left to build — shipped items live in their **Catalog** entry (which
names the version each shipped in) and in `CHANGELOG.md`, not here. The **modules platform is otherwise complete**: MOD-01 (v1.4.0), MOD-02 (the
`health-monitor` module), MOD-08 (v1.5.0).

1. ⏳ **SEC-04 — Session lifecycle hardening**
2. ⏳ **SEC-05 — Trusted-IP auto-login**
3. ⏳ **OPS-13 — Email: bounded, diagnosable connection testing** — from **BUG-21**; do it with that fix
4. ⏳ **OPS-02 — Self-service password reset (SSPR)** — email itself already shipped (v1.2.5)
5. ⏳ **OPS-07 — Bring-your-own cert: how-to + validate/upload, or OS cert store**
6. ⏳ **OPS-08 — Let's Encrypt: process-oriented progress feedback**
7. ⏳ **MOD-11 — Hand helper APIs through the context** — makes capability checks enforcement rather than
   advice; worth doing before helper-side enforcement spreads
8. ⏳ **OPS-14 — Tell a beta user when their channel is behind stable** — small, and closes a blind spot
   **core itself created** in v1.5.3-beta.9. **Position not yet confirmed by the owner** (added
   2026-07-24) — move it freely
9. ⏳ **CORE-05 — "Buy me a coffee" banner + `/help-meeeee` support page** — small and self-contained;
   the exact route spelling is the joke and is locked. **Position not yet confirmed by the owner**
   (added 2026-07-24) — move it freely
10. 🧊 **SEC-02 — IP allow / deny** — deprioritised 2026-07-20; revisit alongside SEC-05, which shares the
   trusted-proxy XFF prereq
11. 🧊 **SEC-06 — Scoped API tokens + read-first JSON API** — what the MCP server needs; **low priority by
   owner decision 2026-07-23**. Nothing in JonDash needs it; it unblocks a separate repo
12. 🧊 **OPS-06 — Optional skip of browser auto-open on launch** — reclassified from BUG-06
13. 🌅 **MOD-07 — Modifications (core-modifying add-ons)** — reserved; the module framework must stay able
    to add it later
14. 🌅 **OPS-03 — VHD appliance**
15. 🌅 **OPS-15 — Publish the bug tracker + security reviews** — deliberately held back for now; see the
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

#### SEC-06 · Scoped API tokens + read-first JSON API — 🧊 Backlog (low priority, owner decision 2026-07-23)
An authenticated **`/api/v1`** for external clients, plus the token model behind it. Nothing inside JonDash
needs this — it exists to unblock the separate **JonDash-MCP** server, which can currently do only an
unauthenticated health check. **Full specification already written** and maintained by the MCP session:
[JonDash-mcp/docs/API-CONTRACT.md](https://github.com/jontiadcock/JonDash-mcp/blob/main/docs/API-CONTRACT.md)
— implement from that rather than re-deriving it.
- **Token model:** an `ApiToken` row storing only a **SHA-256 hash** plus an 8-char display prefix; format
  `jd_` + 43 base64url chars. Shown once at mint, revocable, optional expiry.
- **Authorization is an intersection, not a replacement:** effective permission =
  `token scopes ∩ getEffectivePermissions(user)`, evaluated per request. A token can never grant more than
  the account it belongs to, and existing RBAC stays untouched.
- **Scopes:** `status:read`, `services:read/write`, `groups:read`, `modules:read/write`, `users:read/write`,
  `audit:read`, `sessions:read`. Read-first — writes are a later, opt-in tier.
- **The same-origin/CSRF exemption is scoped to token-authenticated `/api/v1` handlers and nothing else** —
  this is the part to get right, since widening it anywhere else would undo CSRF protection app-wide.
- **Never returned by the API:** `passwordHash`, `totpSecretEnc`, `setupTokenHash`, `codeHash`,
  `tokenHash`, session tokens. Deliberately excluded from the API surface entirely: applying updates,
  restart/shutdown, backup export/restore, resetting access, deleting users.
- **Why it's low:** a bearer token in an AI client's config is a weaker credential than an interactive
  password + 2FA login, and this adds a new externally-reachable authenticated surface to a security-first
  app that currently has none. There is no user-facing pressure for it — the cost of getting it wrong is
  much higher than the cost of waiting.

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

**One leftover from MOD-05, deliberately not carried as its own item:** Browse *prints* a module's
requirement ("needs JonDash 1.5.0+") rather than greying out entries this build is too old for. The
enforcement is real — installs are refused — only the visual cue is missing. Fold it into the next
piece of module-UI work rather than tracking it.

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

#### OPS-13 · Email: bounded, diagnosable connection testing — ⏳ (exposed by BUG-21)
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

#### CORE-05 · "Buy me a coffee" banner + a support page — ⏳ Planned
Owner request, 2026-07-24. A **small** banner offering to support the project with a coffee, linking to
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

#### CORE-04 · Full UI rework — ⏳ scope TBD
Owner decision 2026-07-23. **The look changes significantly; the functionality does not.** Buttons,
controls and flows stay as they are — this is a visual pass, not a re-architecture, and nothing here
should become a reason to move or remove a control someone already relies on.

**Not yet scoped.** Deliberately left open: agree the direction before any of it is built, because a
half-applied restyle across ~20 admin pages is worse than either the old look or the new one.

Worth carrying into it when it is scoped:
- **Mobile/responsive is already an ongoing commitment** (moved from CORE-03) — fold it in rather than
  treating it as separate work afterwards.
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
