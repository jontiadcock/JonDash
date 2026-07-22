# Building JonDash modules

> **The module framework is live** as of JonDash 1.4.0-beta.3 — installing from a source, importing your own,
> the install-time verifier and the runtime APIs below all ship. This document is the contract; where it and
> the code ever disagree, the code wins and this is a bug. Nothing here changes the base app if you don't
> install any modules.

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
outbound network requests", "can send email using your configured mail account") for your approval, then rebuilds and
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
  net?:     { ping(host: string, opts?: { timeoutMs?: number }): Promise<number | null> };  // network:outbound
  email?:   { send(msg: { to; subject; text?; html? }): Promise<void> };  // only with email:send
  audit?:   (action: string, detail?: string) => Promise<void>;          // only with audit:write
};
```

Baseline (no permission needed): your own `settings`, your own `store`, and your own `mod_<id>_*` tables.

`ctx.net.ping` returns the round-trip in ms, or `null` when the host doesn't answer (unreachable is a normal
result, not an error). ICMP is provided by the framework because it needs the OS `ping` binary, which modules
are **not** allowed to invoke — the host validation and argument handling live once in core.
`ctx.email.send` **throws** if email isn't configured or the send fails, so a module can't silently not send.

### Doing something: `moduleAction`

A widget or page can render, but a **button needs a server action**. Wrap it — this is the only sanctioned
way for a module to mutate anything:

```ts
"use server";
import { moduleAction } from "@/lib/modules/api";

export const addCheck = moduleAction("my-module", async (ctx, formData: FormData) => {
  await ctx.db!.run(`INSERT INTO ${ctx.db!.table("checks")} (url) VALUES (?)`, String(formData.get("url")));
});
```

It verifies the module is installed and enabled, that the caller is signed in (a **full admin** if your module
is `adminOnly`), and hands you a ctx scoped to your granted permissions. It **throws** on any failure rather
than returning something falsy — never catch and ignore it.

### Your own settings UI: `SettingsPanel`

Declared settings are auto-rendered as a simple form. When you need more than that — a table, a wizard, a
list with add/remove — export a `SettingsPanel` component from your definition. It renders in
**Admin → Modules → *your module*, below the auto-generated fields**, so you can have both:

```tsx
// module.ts
import SettingsPanel from "./settings-panel";
const mod: ModuleDefinition = { …, settings: [ … ], SettingsPanel };
```

It receives the same **capability-scoped `ctx`** as your widget and page — being on an admin screen grants
it nothing extra. It renders only once the module is **enabled**, since permissions aren't granted before
that. Use `moduleAction` for anything it changes.

### Background work: `systemModuleContext`

For pollers and schedulers there's no signed-in user. Don't hold on to a ctx captured from a request — every
later audit entry would be attributed to whoever happened to trigger the first one:

```ts
import { systemModuleContext } from "@/lib/modules/api";
const ctx = await systemModuleContext("my-module");
```

### The only two core imports you may use

| Import | Use |
| --- | --- |
| `@/lib/modules/types` | Types. No `server-only`, so it's safe from a client component. |
| `@/lib/modules/api` | Runtime: `moduleAction`, `systemModuleContext`. |

**Anything else under `@/lib/…` is refused at install** — including the framework's own `store`, `migrate`,
`manage`, `registry` and `context`. Everything else you need arrives on `ctx`.

---

## Permissions (declare the least you need)

| Permission        | Grants                                                        |
| ----------------- | ------------------------------------------------------------ |
| `network:outbound`| Connect out: `ctx.fetch`, `ctx.net.ping`, and raw TCP/DNS/TLS (`node:net`/`dns`/`tls`/`http(s)`). |
| `crypto:use`      | Encrypt/decrypt with the app key (`ctx.crypto`).            |
| `audit:write`     | Write audit-log entries (`ctx.audit`).                      |
| `email:send`      | Send email via the admin's configured mailer.               |

**Etiquette:** request the *fewest* permissions that make your module work; be truthful
in `name`/`description`; if you call an external service, declare
`network:outbound` and say which service in `MODULE.md`. Each permission is shown to the admin as a
plain-language warning at install — over-asking gets your module declined.

**Honest security note:** modules run in the same process as JonDash and are **not hard-sandboxed**. The
permission consent + scoped context are the model for **curated / self-built** modules. Don't install a
module you don't trust; hardened sandboxing for untrusted third parties is a later feature.

### What the installer checks (and will refuse)

Every module is statically verified **before** it's written to disk and compiled in. Your module is rejected
outright — with the reason shown to the admin — if it:

- uses a capability it didn't declare (`node:net`/`dns`/`tls`/`http(s)` or a bare `fetch()` ⇒ you must declare
  `network:outbound`; `node:crypto` ⇒ `crypto:use`);
- touches the **filesystem** (`node:fs`) — your data belongs in `ctx.db` / `ctx.store`;
- uses `child_process`, `eval`, `new Function`, or a **computed** `import()`;
- reads `process.env` — configuration belongs in your settings;
- imports core internals instead of the two allowed paths above;
- declares different permissions in `module.ts` than its `addons.json` entry advertises;
- fails archive hygiene: a path escaping the module folder, a disallowed file type, or a package over the
  size/file-count caps.

**Which files are checked:** every `.ts`/`.tsx` in your package — **including a `tests/` folder**. Test files
aren't exempt on purpose: your module is compiled into the app, so anything you ship can be imported by real
code, and an exempt folder would be the obvious place to hide something. `.md`, `.sql` and `.json` are checked
for type/size only (prose and SQL aren't executed as JavaScript).

That means **tests which exercise the framework itself** — importing `prisma`, `manage`, `context` and so on —
must live *outside* the module you publish; those imports are refused wherever they appear. Tests that only
cover your own logic are fine to ship.

This is **defence in depth, not a sandbox** — it catches accidents and undeclared capabilities and keeps the
consent screen honest, but a determined author could obfuscate past it. Trust the source you install from.

If a rule blocks something genuinely legitimate, ask for a framework capability (that's exactly how
`ctx.net.ping` came to exist) rather than working around it.

---

## Widget size — design for it, don't assume it

Your dashboard widget is **resized by each user, not by you.** Every user can set their own width and
height (1–3 grid columns/rows) for your widget, and their choice doesn't affect anyone else's. There is no
"correct" size to design for, so:

- **Never hardcode pixel widths or heights.** Fill the space you're given — the frame sizes itself. Use
  `width: 100%`, flex/grid, and `max-width: 100%` on anything that could overflow.
- **Degrade downwards.** At 1×1 (the default, and roughly a third of the row on desktop) show the single
  most important thing: a status, a count, a colour. Reserve tables, charts and detail for wider sizes.
- **Don't rely on media queries** — the widget's box changes size independently of the viewport, so a
  `@media` breakpoint tells you about the screen, not about your widget. Prefer layouts that reflow
  naturally (`flex-wrap`, `grid-template-columns: repeat(auto-fit, minmax(...))`, `container` queries).
- **Everything is full width on a phone.** Small screens collapse to one column regardless of the chosen
  width, so your "wide" layout must still work narrow.
- **Put the detail on your page, not in the widget.** If it doesn't fit at 1×1, that's a signal it belongs
  at `/m/<id>`. The widget's job is to be glanceable and to link through.

A module may also ship an **icon** — a small component (typically an inline SVG) on `icon` in its
definition. Use `currentColor` rather than fixed colours so it follows the user's light/dark theme.

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

> **Prefer a working example?** The official add-ons source publishes a **"Module template (for developers)"**
> module — install it from Admin → Modules → Browse (beta channel) and you get a complete, working module
> with a widget, a page, its own table, and add/delete forms built on `moduleAction`, plus its own
> `AI-PROMPT.md`. Starting from that is usually faster than generating from scratch.

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
    minAppVersion: string;      // minimum JonDash version. Use "1.4.0-beta.3" or later if you use
                                //   moduleAction / ctx.email / ctx.net / systemModuleContext
    permissions: ModulePermission[];   // request the FEWEST needed (list below)
    settings?: { key: string; label: string; type: "string"|"text"|"number"|"boolean";  // "text" = multiline
                 default?: unknown; secret?: boolean }[];   // secret values are encrypted at rest
    icon?: React component;             // optional small inline SVG; use currentColor
    DashboardWidget?: React component;  // optional; EACH USER resizes it (1-3 cols/rows) - fill the
                                        //   space given, no fixed px, degrade to a glance at 1x1
    Page?: React component;             // optional; enables /m/<id>/...
    SettingsPanel?: React component;    // optional; rendered UNDER the auto-generated `settings` fields
                                        //   in Admin -> Modules -> <module>, with a scoped ctx
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
  ctx.net?            // ONLY with "network:outbound": .ping(host,{timeoutMs?}) -> ms, or null if no reply
  ctx.crypto?         // ONLY with "crypto:use": .encrypt(s) .decrypt(s)
  ctx.email?          // ONLY with "email:send": .send({to,subject,text?,html?}) — THROWS if it fails
  ctx.audit?(action, detail?)   // ONLY with "audit:write"
  Baseline (no permission needed): your settings, your store, your own mod_<id>_* tables.

DOING SOMETHING (buttons/forms) — a widget or page can render, but a mutation MUST go through moduleAction.
This is the only sanctioned way for a module to change anything:
    "use server";
    import { moduleAction } from "@/lib/modules/api";
    export const addThing = moduleAction("<id>", async (ctx, formData: FormData) => { ... });
  It checks the module is installed and enabled and the caller is signed in (a full admin if adminOnly),
  and hands you a ctx scoped to your granted permissions. It THROWS on failure — never catch and ignore.

BACKGROUND WORK (pollers/schedulers) — there is no signed-in user, and you must NOT reuse a ctx captured
from a request (every later audit entry would be blamed on whoever triggered the first one):
    import { systemModuleContext } from "@/lib/modules/api";
    const ctx = await systemModuleContext("<id>");

THE ONLY TWO CORE IMPORTS YOU MAY USE:
    "@/lib/modules/types"   types only (no server-only; safe from a client component)
    "@/lib/modules/api"     runtime: moduleAction, systemModuleContext
  Anything else under "@/lib/..." is REFUSED at install. Everything else arrives on ctx.

THE INSTALLER STATICALLY VERIFIES YOUR CODE AND WILL REFUSE IT IF IT:
  - uses a capability it didn't declare — node:net/dns/tls/http(s) or a bare fetch() require
    "network:outbound"; node:crypto requires "crypto:use";
  - touches the filesystem (node:fs) — your data belongs in ctx.db / ctx.store;
  - uses child_process, eval, new Function, or import() with a computed path;
  - reads process.env — configuration belongs in your settings;
  - imports core internals instead of the two paths above;
  - declares different permissions in module.ts than its published listing advertises;
  - ships a file type outside .ts .tsx .sql .md .json .css .txt .svg + images, escapes its folder, or
    exceeds 400 files / 2 MB per file / 8 MB total.
  Every .ts/.tsx file is scanned, INCLUDING a tests/ folder. Tests that import core internals must live
  outside the published module.
  NOTE: this is defence in depth, NOT a sandbox — a module runs in-process with the app's privileges. Write
  module code as trusted code: never eval config, never fetch-and-execute remote code, and treat anything an
  external service returns as hostile input (cap lengths, strip control characters before storing).

PERMISSIONS (declare the least; each is shown to the admin as a warning at install):
  network:outbound | crypto:use | audit:write | email:send
  (These are ALL of them. Account, session and filesystem access are not available to modules.)

HARD RULES
- Only ADD; never modify the base app or its tables. Namespace every table you create as mod_<id>_*.
- Keep everything inside modules/<id>/. Add NO new heavy dependencies — use the stack above.
- TypeScript must compile and lint cleanly. Server Components by default; "use client" only where needed.
- Request minimal permissions and explain each in MODULE.md. Never hardcode secrets — use settings/ctx.crypto.
- Structured data → your own mod_<id>_* SQL tables via migrations + ctx.db. Simple data → ctx.store.
- The module must fully clean up on uninstall (the framework drops mod_<id>_* + settings; do any extra
  cleanup in onUninstall).

DELIVERABLES
1. modules/<id>/module.ts  2. modules/<id>/MODULE.md  3. any widget.tsx / page.tsx / migrations/*.sql it
needs, plus a "use server" actions file exporting moduleAction(...) wrappers if it has buttons or forms.
Explain how to test it: put the folder in modules/<id>/ (or import the zipped folder via Admin → Modules →
Import), rebuild + restart, enable it in Admin → Modules (approve the permission prompt), verify the
widget/page/settings work, then confirm disabling hides it and uninstalling removes all its data.

NOW BUILD THIS MODULE:
<<< describe the module you want here — what it should show/do, any external service or API, and its settings >>>
````

Keep the generated module small and single-purpose, review the permissions it asks for, and test it on a
scratch/second install before trusting it on your live one.
