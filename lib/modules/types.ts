import type { ComponentType, ReactNode } from "react";

/*
 * The module contract (MOD-01). A module ADDS functionality without modifying the base app; core
 * imports only the generated registry, so with zero modules the app is byte-for-byte its current self.
 *
 * REFS lib/modules/context.ts › buildModuleContext() — turns a grant into a capability
 *      lib/modules/verify.ts — enforces the declaration rules at install
 *      docs/MODULES-AUTHORING.md — ⚠ the author-facing copy; update it when this changes
 */

/**
 * Permissions a module may request. Each is shown to the admin as plain language at install, and
 * the matching capability appears on `ModuleContext` only when granted.
 *
 * ⚠ **Only permissions that actually grant something are listed.** Drafts of `db:users:*`,
 *   `db:core:*`, `crypto:key:read`, `sessions:*` and `files:*` were deleted rather than left inert
 *   — a warning that sounds serious and grants nothing teaches people to wave consent screens
 *   through. Each returns with the capability that implements it.
 * REFS lib/modules/context.ts — where each of the four below is actually handed over
 */
export type ModulePermission =
  | "network:outbound" // outbound connections: ctx.fetch, raw TCP/DNS/TLS, ctx.net.ping
  | "crypto:use" // encrypt/decrypt with the app key (ctx.crypto)
  | "audit:write" // write audit-log entries (ctx.audit)
  | "email:send"; // send email via the admin's configured mailer

/**
 * A capability named by a HELPER, not core (MOD-08), shaped `<helperId>:<verb>`.
 *
 * ⚠ **A core permission is a capability token; this is only words.** Core gates a `ModuleContext`
 *   field structurally, so inventing that string grants nothing. A helper permission gates nothing
 *   in core — the helper enforces it behind its own API. That asymmetry is what lets a helper ship
 *   a capability without a core release. The namespace must equal the helper id.
 * REFS lib/modules/verify.ts — refuses `@/helpers/<id>/api` unless the helper was declared
 */
export type HelperPermission = string;

/**
 * A core permission, or one named by a helper the module declares.
 * REFS lib/modules/install.ts — grants them · lib/modules/permissions.ts — stores them ·
 *      lib/modules/context.ts — turns a grant into a capability · app/admin/permissions/actions.ts
 */
export type DeclaredPermission = ModulePermission | (string & {});

/** `<helperId>:<verb>` — lowercase, no leading digit on the verb. */
export const HELPER_PERMISSION_RE = /^[a-z0-9][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/**
 * ⚠ Declared here rather than derived from `PERMISSION_WARNINGS` below — these predicates are
 *   called from module scope and must not depend on evaluation order.
 */
/** PINS tests/unit/permission-consent.test.ts — asserts this and PERMISSION_WARNINGS agree. */
export const CORE_PERMISSIONS: ReadonlySet<string> = new Set([
  "network:outbound",
  "crypto:use",
  "audit:write",
  "email:send",
]);

/**
 * True for one of the four capabilities core itself implements.
 * PINS tests/unit/permission-consent.test.ts
 */
export function isCorePermission(p: string): p is ModulePermission {
  return CORE_PERMISSIONS.has(p);
}

/**
 * The helper that must be declared for this permission, or null. ⚠ The namespace IS the helper id —
 * derived, never a hardcoded map, so the two cannot drift.
 * REFS lib/modules/verify.ts · lib/modules/sources.ts · lib/helpers/types.ts — all rely on this
 */
export function helperIdForPermission(p: string): string | null {
  if (isCorePermission(p)) return null;
  if (!HELPER_PERMISSION_RE.test(p)) return null;
  return p.slice(0, p.indexOf(":"));
}

/**
 * The shape a permission list must satisfy to be accepted at all.
 * REFS lib/modules/sources.ts — rejects a whole manifest entry when this fails
 * PINS tests/unit/permission-consent.test.ts
 */
export function isValidPermission(p: unknown): p is DeclaredPermission {
  return typeof p === "string" && (isCorePermission(p) || HELPER_PERMISSION_RE.test(p));
}

/** A configurable setting a module declares; the framework renders + stores it
 *  (secret values encrypted at rest via the app's crypto). */
export type ModuleSettingField = {
  key: string;
  label: string;
  /** "text" renders a multiline textarea — for JSON blobs, notes, lists of hosts, etc. */
  type: "string" | "text" | "number" | "boolean";
  default?: string | number | boolean;
  help?: string;
  /** Encrypted at rest and never sent to the client in plaintext. */
  secret?: boolean;
};

/**
 * A module's own settings, scoped to it. REFS lib/modules/store.ts › moduleSettingsApi()
 */
export type ModuleSettingsApi = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  all(): Promise<Record<string, unknown>>;
};

/**
 * Per-module key/value store, no migration needed. REFS lib/modules/store.ts › moduleStoreApi()
 */
export type ModuleStoreApi = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { secret?: boolean }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<{ key: string; value: unknown }[]>;
};

/** Scoped raw-SQL access to the module's OWN tables (present only when the module
 *  ships migrations). A module may only touch its `mod_<id>_*` tables. */
export type ModuleDbApi = {
  /** Resolve a logical table name to its namespaced physical name `mod_<id>_<name>`. */
  table(name: string): string;
  query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<void>;
};

/** One block of label/value rows in a module's email — a digest, a list of failures. */
export type ModuleMailList = {
  heading: string;
  rows: { label: string; value: string; state?: "ok" | "warn" | "bad" }[];
};

/**
 * Send mail through the admin's configured mailer ("email:send"). **Core owns the chrome; the
 * module supplies the body** — `text` is HTML-escaped before wrapping, so a module cannot ship mail
 * that looks like JonDash's own.
 *
 * ⚠ **Do not hard-wrap `text`.** Blank line → paragraph, single newline → line break; wrapping at
 *   78 characters breaks mid-sentence and the client wraps again at its own width.
 * REFS lib/modules/context.ts — implements this · lib/email/template.ts › renderBrandedEmail()
 */
export type ModuleEmailApi = {
  /** Throws if email isn't configured yet or the send fails — never fails silently. */
  send(msg: {
    to: string;
    subject: string;
    /** The body, as plain text. Escaped and wrapped by core. */
    text?: string;
    /**
     * Optional heading inside the message. Defaults to the subject, which is usually right.
     */
    title?: string;
    /** Optional structured blocks — repeatable, so "failed" and "not run" can be separate. */
    lists?: ModuleMailList[];
    /**
     * A single call to action. ⚠ **`path` only** — a module cannot know the install's external
     * address, so core resolves it; anything not root-relative is dropped rather than sent broken.
     * REFS lib/app-url.ts › resolveAppUrl() — the resolver, and why a Host header is not used
     */
    cta?: { label: string; path: string };
    /** Escape hatch: raw HTML, no branded shell. ⚠ Outlook rendering becomes the module's problem. */
    html?: string;
  }): Promise<void>;
};

/**
 * Probes `fetch` cannot express ("network:outbound"). ICMP is here because it needs the OS `ping`
 * binary, and doing that safely — strict host validation, fixed argument list, no shell — belongs
 * in trusted core once. REFS lib/modules/net.ts › pingHost() — the hardened implementation
 */
export type ModuleNetApi = {
  /** ICMP echo. Resolves round-trip milliseconds, or null if the host didn't answer. */
  ping(host: string, opts?: { timeoutMs?: number }): Promise<number | null>;
};

/**
 * The context handed to a module's hooks and data functions. Optional members are present **only**
 * when the matching permission was granted. REFS lib/modules/context.ts › buildModuleContext()
 */
export type ModuleContext = {
  moduleId: string;
  /** The current signed-in user (in a request context), or null. */
  user: { id: string; email: string; role: "ADMIN" | "USER" } | null;

  /**
   * What this module was granted, and a predicate over it (MOD-10). Exists because a helper's API
   * is imported directly, so no field can be withheld — without it a module could declare only
   * `filesystem:read` and call every write method, with nothing able to notice.
   *
   * **Helpers: check `ctx.can(...)` at the top of every privileged call** — core never sees the call.
   *
   * ⚠ **ADVISORY, NOT A SECURITY BOUNDARY, and it reads like one.** The module hands this object to
   *   the helper and can hand a lookalike; freezing does not help, because a spread builds a new
   *   object. `moduleId` is forgeable the same way, so audit attribution can be misdirected.
   *   **`ctx.fetch` being absent is enforcement; this is not.** MOD-11 is the shape that would be.
   */
  grants: readonly DeclaredPermission[];
  can: (permission: DeclaredPermission) => boolean;

  settings: ModuleSettingsApi;
  store: ModuleStoreApi;

  db?: ModuleDbApi; // only when the module ships migrations
  crypto?: { encrypt(s: string): string; decrypt(s: string): string }; // "crypto:use"
  fetch?: typeof fetch; // "network:outbound"
  net?: ModuleNetApi; // "network:outbound"
  email?: ModuleEmailApi; // "email:send"
  audit?: (action: string, detail?: string) => Promise<void>; // "audit:write"
};

/**
 * A helper a module needs, with the oldest version it was built against (MOD-10).
 * PINS tests/unit/helper-declarations.test.ts
 */
export type ModuleHelperNeed = {
  id: string;
  /** Oldest helper version this module works with. Omit if it has no floor. */
  minVersion?: string;
};

/**
 * The plain id of a declared helper, whichever form was used.
 * PINS tests/unit/helper-declarations.test.ts
 */
export function helperNeedId(h: string | ModuleHelperNeed): string {
  return typeof h === "string" ? h : h.id;
}

/**
 * Just the ids — what most callers want.
 * REFS lib/helpers/install.ts · lib/helpers/channel.ts · lib/helpers/reconcile.ts ·
 *      lib/helpers/registry.ts · lib/helpers/updates.ts — every helper resolution path
 */
export function helperIdsOf(helpers: (string | ModuleHelperNeed)[] | undefined): string[] {
  return (helpers ?? []).map(helperNeedId);
}

/** A unit of periodic work a module declares; run by the scheduler helper. */
export type ModuleSchedule = {
  /** Stable id, unique within the module — used to remember when it last ran. */
  key: string;
  /** How often to run, in milliseconds. Clamped to a sane floor by the scheduler. */
  everyMs: number;
  /** Run it. Receives a system context (no signed-in user). Must handle its own errors. */
  run: (ctx: ModuleContext) => Promise<void>;
  /** Skip the catch-up run at boot and wait a full interval instead. */
  skipOnBoot?: boolean;
};

/** Props passed to a module's dashboard widget. */
export type ModuleWidgetProps = { ctx: ModuleContext };
/** Props passed to a module's page (served at /m/<id>/...). */
export type ModulePageProps = { ctx: ModuleContext; path: string[] };
/** Props passed to a module's custom settings panel (optional; else auto-generated). */
export type ModuleSettingsPanelProps = { ctx: ModuleContext };

/**
 * One table an add-on wants carried in backups (OPS-16). ⚠ Lives here rather than beside the backup
 * code, which is `server-only` and would break any client component touching a definition.
 * REFS lib/backup-addons.ts — the implementation · lib/helpers/types.ts — the helper-side declaration
 */
export type BackupTableDecl = {
  /** The logical, un-prefixed name used in the add-on's own migrations. */
  name: string;
  /** Columns holding credentials or tokens: kept in an encrypted backup, blanked from a plain one. */
  secret?: string[];
};

/**
 * The default export of `modules/<id>/module.ts`. `id` is a stable lowercase-kebab string equal to
 * the folder name.
 *
 * REFS lib/modules/manage.ts — install and uninstall · lib/modules/context.ts — builds the ctx ·
 *      lib/modules/generated.ts — the static import list, since modules compile into the build ·
 *      app/admin/modules/page.tsx — renders them
 */
export type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  version: string; // semver
  minAppVersion: string; // minimum JonDash version required
  permissions: DeclaredPermission[];

  /**
   * Helpers this module needs (MOD-08). Declaring one permits the `@/helpers/<id>/api` import and
   * that helper's permissions. ⚠ The `addons.json` entry must match exactly.
   *
   * ```ts
   * helpers: ["scheduler"]                              // no floor
   * helpers: [{ id: "scheduler", minVersion: "0.0.3" }]  // needs 0.0.3+
   * ```
   *
   * A floor reports a too-OLD helper rather than letting the module misbehave silently.
   * REFS lib/modules/verify.ts — enforces the import rule · lib/helpers/channel.ts — resolves versions
   */
  helpers?: (string | ModuleHelperNeed)[];

  /**
   * Periodic work **declared, not started** by the module (MOD-08) — the scheduler helper collects
   * these at boot, so background work runs from server start rather than the first widget render.
   * Requires declaring the "scheduler" helper.
   *
   * ⚠ Declarative on purpose: a module never runs arbitrary code at boot, and the schedule is
   *   inspectable without executing anything.
   */
  schedules?: ModuleSchedule[];

  /**
   * Which `mod_<id>_*` tables belong in a backup (OPS-16). Names are **logical and un-prefixed**;
   * **undeclared means not exported**; `secret` columns are kept in an encrypted backup and blanked
   * from a plain one.
   *
   * ```ts
   * backup: { tables: [{ name: "checks" }, { name: "targets", secret: ["apiKey"] }] }
   * ```
   *
   * ⚠ **Restored only into the same module version** — a schema that no longer fits corrupts.
   * REFS lib/backup-addons.ts — the implementation · lib/modules/migrate.ts › moduleTableName()
   */
  backup?: { tables: BackupTableDecl[] };

  /** Restrict all of the module's UI to full admins. */
  adminOnly?: boolean;

  /** Declared settings; auto-rendered under Admin → Modules → <module> unless a
   *  custom SettingsPanel is provided. */
  settings?: ModuleSettingField[];

  /**
   * Icon shown next to the module's name. A component rather than an image file, so it ships with
   * the module, needs no serving route, and inherits the theme colour via `currentColor`.
   */
  icon?: ComponentType<{ className?: string }>;

  /** Optional UI extension points. */
  DashboardWidget?: ComponentType<ModuleWidgetProps>;
  Page?: ComponentType<ModulePageProps>;
  SettingsPanel?: ComponentType<ModuleSettingsPanelProps>;

  /** Path (relative to the module folder) to a dir of `NNN_name.sql` migrations for
   *  the module's own `mod_<id>_*` tables. */
  migrations?: string;

  /** ⚠ Core already purges settings, store and `mod_<id>_*` tables — use `onUninstall` only for
   *  state outside those. REFS lib/modules/manage.ts — does the purging */
  onEnable?: (ctx: ModuleContext) => Promise<void>;
  onDisable?: (ctx: ModuleContext) => Promise<void>;
  /** `answers` is keyed by question id; one never asked, or dropped by core, is absent. Read defensively. */
  onUninstall?: (ctx: ModuleContext, answers: Record<string, boolean>) => Promise<void>;

  /**
   * Questions for the uninstall confirmation screen; replies arrive in `onUninstall`. For decisions
   * core cannot make and should not guess — "also remove Docker Desktop?" is wrong to do
   * automatically and wrong to skip silently. A "yes" grants no capability the module lacked.
   *
   * ⚠ **A module is third-party text on a core admin screen**, so core constrains it: attributed to
   *   the module, rendered as text never markup, `default: true` forced false (helpers may default
   *   true), ten questions maximum, bounded and best-effort.
   * REFS lib/uninstall-questions.ts — applies every one of those constraints
   */
  uninstallQuestions?: () => Promise<UninstallQuestion[]>;
};

/**
 * One yes/no question on the uninstall confirmation screen.
 * REFS lib/uninstall-questions.ts — applies every constraint core imposes ·
 *      lib/helpers/types.ts — helpers declare these too, and may default true
 */
export type UninstallQuestion = {
  /** Unique within the asking module or helper. Comes back as the key in `answers`. */
  id: string;
  /** The question, in plain language. Rendered as text. */
  label: string;
  /** What actually happens if they say yes — name the consequence, not the mechanism. */
  detail?: string;
  /** Pre-ticked. **Forced to false for modules**; honoured for helpers. */
  default: boolean;
};

/** A module's installed record (mirrors the `Module` table row), for admin UI. */
export type InstalledModule = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  source: string; // repo URL, or "imported" for a sideloaded package
  grantedPermissions: DeclaredPermission[];
  installedAt: string;
};

/** The sentence shown at install for each permission. REFS describePermission() below — the only reader */
export const PERMISSION_WARNINGS: Record<ModulePermission, string> = {
  "network:outbound": "Connect out to other servers (web requests, and raw TCP, DNS, TLS and ping checks)",
  "crypto:use": "Encrypt and decrypt data with your app's key",
  "audit:write": "Add entries to your audit log",
  "email:send": "Send email using your configured mail account",
};

/**
 * High-risk permissions, highlighted on the consent screen. **Empty for now** — the genuinely
 * dangerous capabilities are exactly the ones still to be built, and must be listed the day they land.
 */
/** PINS tests/unit/permission-consent.test.ts — asserts the styling follows this set. */
export const DANGEROUS_PERMISSIONS: ReadonlySet<ModulePermission> = new Set<ModulePermission>([]);

/**
 * ⚠ **The single place consent text is decided.** Every surface goes through this, which is what
 *   stops one of them rendering a blank for a permission core does not recognise. **Nothing is
 *   silently dropped** — an unrecognised permission is shown, named and flagged as unexplained.
 *
 * A helper-provided capability is **dangerous by default**: core has no opinion about one it did
 * not define, so it never gets the quiet styling.
 * REFS app/admin/modules/browse/module-detail.tsx · app/admin/modules/page.tsx ·
 *      app/admin/updates/page.tsx · lib/helpers/registry.ts — every consent surface
 */
export function describePermission(
  p: DeclaredPermission,
  helperLabels?: Readonly<Record<string, string>>,
): { text: string; dangerous: boolean } {
  if (isCorePermission(p)) {
    return { text: PERMISSION_WARNINGS[p], dangerous: DANGEROUS_PERMISSIONS.has(p) };
  }
  const helperId = helperIdForPermission(p);
  const label = helperLabels?.[p];
  if (label) return { text: label, dangerous: true };
  return {
    text: helperId
      ? `"${p}" — provided by the ${helperId} helper, which did not describe it`
      : `"${p}" — unrecognised capability`,
    dangerous: true,
  };
}

/**
 * How much a module asks for, in one word, for a catalogue card. ⚠ Runs the same permissions
 * through the same `describePermission()` — a summary computed separately would drift, and the card
 * would read "Standard" while the detail page listed something alarming.
 *
 * **A chip is never enough to install on**; approving happens where the full list is on screen.
 * REFS app/admin/modules/browse/page.tsx — the only caller
 */
export type PermissionRisk = "none" | "standard" | "elevated";

/** REFS app/admin/modules/browse/page.tsx — the catalogue card that renders the chip. */
export function permissionRisk(
  permissions: readonly DeclaredPermission[],
  helperLabels?: Readonly<Record<string, string>>,
): { level: PermissionRisk; label: string; count: number } {
  const ids = [...new Set(permissions)];
  if (ids.length === 0) return { level: "none", label: "No extra access", count: 0 };
  const anyDangerous = ids.some((p) => describePermission(p, helperLabels).dangerous);
  return anyDangerous
    ? { level: "elevated", label: "Elevated access", count: ids.length }
    : { level: "standard", label: "Standard access", count: ids.length };
}

/** Re-exported for convenience where a widget/panel returns markup. */
export type ModuleRenderable = ReactNode;
