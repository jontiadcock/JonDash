# Building JonDash modules

> ⚠️ **The module framework (MOD-01) is in active development.** This document is the **target contract**
> for its first release — treat it as the spec. Some details may be refined as it ships; the roadmap
> tracks status. Nothing here changes the base app if you don't install any modules.

A **module** (also called an addon) is a self-contained package that plugs extra functionality into JonDash
— a dashboard widget, its own page(s), and its own settings — **without ever changing the base app**.
Disable or remove a module and JonDash behaves exactly as it did before (like removing an app from a
phone). You can get modules three ways:

1. **From a source repo** — the built-in official `JonDash-addons` source, or any public git repo you add
   by URL, then pick a module to install.
2. **Import your own** — build a module yourself and **import its ZIP directly** (no repo, no app store).
3. **Generate one with AI** — paste the prompt at the bottom of this file into any capable AI agent
   (Claude, etc.), describe what you want, and it produces a ready-to-import module.

Installing/updating a module downloads it, shows you the **permissions it requests** (e.g. "can make
outbound network requests", "can read & write your user accounts") for your approval, then rebuilds and
restarts once. Everything a module stores is removed when you uninstall it.

---

## The contract (what a module is made of)

A module is a folder whose name is the module **id**, containing at minimum `module.ts` and `MODULE.md`:

```
modules/<id>/
  module.ts        # exports a default ModuleDefinition (required)
  MODULE.md        # human spec: what it does, settings, data, permissions, version (required)
  widget.tsx       # optional dashboard widget component
  page.tsx         # optional page component (served at /m/<id>/...)
  migrations/      # optional NNN_name.sql files for the module's own tables
    001_init.sql
```

`module.ts`:

```ts
import type { ModuleDefinition } from "@/lib/modules/types";
import DashboardWidget from "./widget";
import Page from "./page";

const mod: ModuleDefinition = {
  id: "example",                 // stable, lowercase-kebab, unique = the folder name
  name: "Example",
  description: "One line describing what it does.",
  version: "1.0.0",              // semver; you bump this to publish an update
  minAppVersion: "1.4.0",        // minimum JonDash version required
  permissions: ["network:outbound"],   // least privilege — see the list below
  settings: [                    // optional; auto-rendered under Admin → Modules → Example
    { key: "apiUrl", label: "API URL", type: "string", default: "" },
    { key: "apiKey", label: "API key", type: "string", secret: true },  // encrypted at rest
  ],
  DashboardWidget,               // optional
  Page,                          // optional (enables /m/example/...)
  migrations: "./migrations",    // optional (bespoke tables)
  async onEnable(ctx) {},        // optional lifecycle hooks
  async onDisable(ctx) {},
  async onUninstall(ctx) {},     // framework already purges settings + mod_example_* + records
};
export default mod;
```

### What the module gets: `ModuleContext`
Your hooks and data functions receive a **capability-scoped context** — it only exposes what your
declared permissions granted:

```ts
type ModuleContext = {
  moduleId: string;
  user: { id: string; email: string; role: "ADMIN" | "USER" } | null;  // current signed-in user

  settings: { get(key): Promise<unknown>; set(key, value): Promise<void>; all(): Promise<Record<string, unknown>> };
  store:    { get(key): Promise<unknown>; set(key, value, opts?: { secret?: boolean }): Promise<void>;
              delete(key): Promise<void>; list(prefix?): Promise<{ key: string; value: unknown }[]> };

  db?:      { table(name): string; query<T>(sql, ...params): Promise<T[]>; run(sql, ...params): Promise<void> };
              // present only if you shipped migrations; you may ONLY touch your mod_<id>_* tables
  crypto?:  { encrypt(s: string): string; decrypt(s: string): string };  // only with crypto:use
  fetch?:   typeof fetch;                                                 // only with network:outbound
  usersDb?: { /* scoped user access */ };                                // only with db:users:*
  audit?:   (action: string, detail?: string) => Promise<void>;          // only with audit:write
};
```

Baseline (no permission needed): your own `settings`, your own `store`, and your own `mod_<id>_*` tables.

---

## Permissions (declare the least you need)

| Permission        | Grants                                                        |
| ----------------- | ------------------------------------------------------------ |
| `network:outbound`| Make outbound HTTP requests (`ctx.fetch`).                    |
| `db:users:read`   | Read user accounts.                                          |
| `db:users:write`  | Modify user accounts. *(Sensitive.)*                         |
| `db:core:read`    | Read other core tables.                                      |
| `db:core:write`   | Modify other core tables. *(Sensitive.)*                     |
| `crypto:use`      | Encrypt/decrypt with the app key (`ctx.crypto`).            |
| `crypto:key:read` | Read the raw encryption key. **Dangerous — avoid.**         |
| `sessions:read`   | See active sessions.                                        |
| `sessions:manage` | Revoke sessions. *(Sensitive.)*                             |
| `files:read` / `files:write` | Read/write the uploads/filesystem area.           |
| `audit:write`     | Write audit-log entries (`ctx.audit`).                      |
| `email:send`      | Send email via the admin's configured mailer.               |

**Etiquette:** request the *fewest* permissions that make your module work; never request `crypto:key:read`
unless you genuinely must; be truthful in `name`/`description`; if you call an external service, declare
`network:outbound` and say which service in `MODULE.md`. Each permission is shown to the admin as a
plain-language warning at install — over-asking gets your module declined.

**Honest security note:** modules run in the same process as JonDash and are **not hard-sandboxed** yet. The
permission consent + scoped context are the model for **curated / self-built** modules. Don't install a
module you don't trust; hardened sandboxing for untrusted third parties is a later feature.

---

## Extension points
- **Dashboard widget** (`DashboardWidget`): a React component rendered as a card on the main dashboard.
  Read data via `ctx` (server component) or fetch from your own page/api.
- **Own pages** (`Page`): rendered at `/m/<id>/...`; receives the trailing path. Full CRUD screens go here.
- **Settings**: list `settings` and the framework renders + stores them (secrets encrypted) — or ship a
  custom `SettingsPanel` component. Appears under Admin → Modules → *your module*.

Everything is gated by JonDash's existing auth — you never implement login/sessions yourself. A module page
runs behind the normal "must be signed in" guard; declare `adminOnly: true` if only admins should see it.

---

## Strengths & limits (read before you build)
**You can:** add a dashboard widget, add your own pages, store settings (encrypted) and structured data
(your own `mod_<id>_*` SQL tables), call external services (with `network:outbound`), and reuse JonDash's
crypto/audit/email/users via declared permissions.

**You cannot / must not:**
- **Modify the base app** — modules only add. (Core-modifying "modifications" are a separate future thing.)
- **Touch core tables directly** — only via granted `db:*` capabilities on `ctx`.
- **Assume you aren't rebuilt** — module code is compiled into JonDash, so install/update triggers one
  automatic rebuild + restart. Don't rely on hot-reload.
- **Collide** — namespace every table `mod_<id>_*`; keep all files inside your module folder; add no new
  heavy dependencies (keep it self-contained; prefer the platform's stack: Next.js 16 App Router, React 19,
  TypeScript, Prisma/SQLite, Tailwind v4).
- **Break the build** — your TypeScript must compile and lint cleanly, or the install fails and rolls back.

---

## Testing your module
1. Put the folder at `modules/<id>/` (or import its ZIP via **Admin → Modules → Import**).
2. Rebuild + start (the launcher does this automatically on import; manually: `npm run build` then start).
3. **Admin → Modules** → review the permission prompt → **Enable**.
4. Verify: the widget renders on the dashboard; its settings save (reload — secrets shouldn't be readable in
   the DB); the page loads at `/m/<id>`; **Disable** hides the widget/page/settings; **Uninstall** removes
   its settings and drops its `mod_<id>_*` tables (confirm the baseline app is unchanged throughout).
5. Optional: add a Vitest test for your module's logic.

## Packaging / publishing
- **Import (sideload):** ZIP the module folder (so `module.ts` sits at the archive root) and import it in
  **Admin → Modules → Import**. No repo needed.
- **Repo (for sharing/auto-update):** put the module in a public git repo with a manifest listing its id,
  version, `minAppVersion`, permissions, and a release-archive URL per version. Bump `version` (semver) to
  publish an update; installs update **independently of the JonDash base version**.

---

## The AI prompt — generate a module with any AI agent

Copy everything in the box below into a capable AI agent (e.g. Claude), then add your own one or two
sentences at the end describing the module you want. The prompt is self-contained — the AI does **not** need
to know anything about JonDash beforehand.

````text
You are building a "module" (an addon) for a self-hosted web app called JonDash. You have never seen this
app; everything you need is in this prompt. Follow the contract exactly and output complete files.

WHAT JONDASH IS
- A secure, self-hosted, multi-user dashboard. Stack: Next.js 16 (App Router), React 19, TypeScript,
  Prisma + SQLite, Tailwind CSS v4. Server Components by default; add "use client" only when a component
  needs interactivity. Data mutations use React Server Actions or route handlers.
- It has a strict, security-first design. Users sign in with a password + authenticator (2FA).

WHAT A MODULE IS
- A self-contained folder that ADDS functionality (a dashboard widget, its own page(s), its own settings and
  data) WITHOUT changing the base app. If the module is disabled or removed, the app must behave exactly as
  if the module never existed. Modules must never modify core files, core database tables, or other modules.
- The core app compiles your module in at build time and gives you a capability-scoped context object; you
  never import core internals directly and never implement your own auth/session logic.

FOLDER + FILES (the module id is a stable lowercase-kebab string and equals the folder name):
  modules/<id>/
    module.ts        (required) exports `export default` a ModuleDefinition
    MODULE.md        (required) plain-English spec: purpose, settings (mark which are secret), data/tables,
                     the permissions it requests and why, and a version history
    widget.tsx       (optional) the dashboard widget component
    page.tsx         (optional) the page component, served at /m/<id>/...
    migrations/001_init.sql ... (optional) SQL for the module's OWN tables

THE ModuleDefinition TYPE (produce module.ts matching this shape):
  {
    id: string; name: string; description: string;
    version: string;            // semver, e.g. "1.0.0"
    minAppVersion: string;      // minimum JonDash version, e.g. "1.4.0"
    permissions: ModulePermission[];   // request the FEWEST needed (list below)
    settings?: { key: string; label: string; type: "string"|"number"|"boolean";
                 default?: unknown; secret?: boolean }[];   // secret values are encrypted at rest
    DashboardWidget?: React component;  // optional
    Page?: React component;             // optional; enables /m/<id>/...
    SettingsPanel?: React component;    // optional; else the framework auto-renders `settings`
    migrations?: string;                // optional path to the migrations dir
    adminOnly?: boolean;                // optional; restrict all UI to admins
    onEnable?(ctx): Promise<void>; onDisable?(ctx): Promise<void>; onUninstall?(ctx): Promise<void>;
  }

THE CONTEXT you receive (ctx) — ONLY the fields your permissions granted are present:
  ctx.moduleId
  ctx.user            // { id, email, role } of the signed-in user, or null
  ctx.settings        // .get(key) .set(key,value) .all()   (your declared settings; secrets auto-encrypted)
  ctx.store           // generic per-module key/value store: .get .set(key,value,{secret?}) .delete .list(prefix?)
  ctx.db?             // ONLY if you ship migrations. .table(name)->"mod_<id>_<name>", .query<T>(sql,...p),
                      //   .run(sql,...p). You may ONLY read/write your own mod_<id>_* tables.
  ctx.fetch?          // ONLY with "network:outbound"
  ctx.crypto?         // ONLY with "crypto:use": .encrypt(s) .decrypt(s)
  ctx.usersDb?        // ONLY with "db:users:read"|"db:users:write"
  ctx.audit?(action, detail?)   // ONLY with "audit:write"
  Baseline (no permission needed): your settings, your store, your own mod_<id>_* tables.

PERMISSIONS (declare the least; each is shown to the admin as a warning at install):
  network:outbound | db:users:read | db:users:write | db:core:read | db:core:write |
  crypto:use | crypto:key:read (DANGEROUS, avoid) | sessions:read | sessions:manage |
  files:read | files:write | audit:write | email:send

HARD RULES
- Only ADD; never modify the base app or its tables. Namespace every table you create as mod_<id>_*.
- Keep everything inside modules/<id>/. Add NO new heavy dependencies — use the stack above.
- TypeScript must compile and lint cleanly. Server Components by default; "use client" only where needed.
- Request minimal permissions and explain each in MODULE.md. Never hardcode secrets — use settings/ctx.crypto.
- Structured data → your own mod_<id>_* SQL tables via migrations + ctx.db. Simple data → ctx.store.
- The module must fully clean up on uninstall (the framework drops mod_<id>_* + settings; do any extra
  cleanup in onUninstall).

DELIVERABLES
1. modules/<id>/module.ts  2. modules/<id>/MODULE.md  3. any widget.tsx / page.tsx / migrations/*.sql it needs.
Explain how to test it: put the folder in modules/<id>/ (or import the zipped folder via Admin → Modules →
Import), rebuild + restart, enable it in Admin → Modules (approve the permission prompt), verify the
widget/page/settings work, then confirm disabling hides it and uninstalling removes all its data.

NOW BUILD THIS MODULE:
<<< describe the module you want here — what it should show/do, any external service or API, and its settings >>>
````

Keep the generated module small and single-purpose, review the permissions it asks for, and test it on a
scratch/second install before trusting it on your live one.
