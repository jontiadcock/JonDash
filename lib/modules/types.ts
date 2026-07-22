import type { ComponentType, ReactNode } from "react";

/**
 * JonDash module framework (MOD-01) — the public contract.
 *
 * A module is a self-contained addon that ADDS functionality (a dashboard widget,
 * its own page(s), its own settings + data) WITHOUT modifying the base app. The core
 * never imports a module directly — only the generated registry — so with zero modules
 * the app is byte-for-byte its current self. See docs/MODULES-AUTHORING.md (the author
 * guide + AI prompt) and the `jondash-module-framework` reference for the full design.
 *
 * This is the Phase 1 contract; the runtime (registry, context, store, migrate,
 * install) is built against these types.
 */

/**
 * Permissions a module may request. Each is surfaced to the admin as a plain-language
 * warning at install/enable; the framework only exposes the matching capability on the
 * ModuleContext when it was granted. Baseline (no permission needed): a module's own
 * settings, its own generic store, and its own `mod_<id>_*` tables.
 */
/**
 * Only permissions that actually grant something are listed. Earlier drafts also declared
 * `db:users:*`, `db:core:*`, `crypto:key:read`, `sessions:*` and `files:*` — none of which
 * were ever wired to a capability. They were removed rather than left in place, because a
 * permission that shows the admin a serious-sounding warning ("Create, modify or delete
 * your user accounts") and then grants nothing teaches people to wave consent screens
 * through. Each will be reintroduced with the capability that implements it.
 */
export type ModulePermission =
  | "network:outbound" // outbound connections: ctx.fetch, raw TCP/DNS/TLS, ctx.net.ping
  | "crypto:use" // encrypt/decrypt with the app key (ctx.crypto)
  | "audit:write" // write audit-log entries (ctx.audit)
  | "email:send"; // send email via the admin's configured mailer

/**
 * A capability NAMED BY A HELPER rather than by core (MOD-08), shaped `<helperId>:<verb>`
 * — e.g. `filesystem:write`. Core deliberately does not enumerate these.
 *
 * The distinction is not cosmetic. A core permission is a **capability token**: it gates a
 * field on `ModuleContext` (see `context.ts`), so it cannot exist without core code that
 * grants it, and inventing the string grants nothing. A helper-provided permission gates
 * nothing in core — the helper enforces it behind its own narrow API, and the verifier
 * refuses `@/helpers/<id>/api` unless the module declared that helper. Core's only job is
 * to **describe** it to the admin, and description is words.
 *
 * That is what lets a helper ship a new capability without a core release, which is the
 * whole point of helpers. The namespace must equal the helper's id, so two helpers can
 * never collide and none can shadow a core permission.
 */
export type HelperPermission = string;

/** Anything a module may declare: a core permission, or one named by a helper it declares. */
export type DeclaredPermission = ModulePermission | (string & {});

/** `<helperId>:<verb>` — lowercase, no leading digit on the verb. */
export const HELPER_PERMISSION_RE = /^[a-z0-9][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/**
 * The capabilities core itself implements. Declared here rather than derived from
 * `PERMISSION_WARNINGS` (defined further down) so nothing depends on evaluation order —
 * these predicates are called from module scope in places.
 */
export const CORE_PERMISSIONS: ReadonlySet<string> = new Set([
  "network:outbound",
  "crypto:use",
  "audit:write",
  "email:send",
]);

/** True for one of the four capabilities core itself implements. */
export function isCorePermission(p: string): p is ModulePermission {
  return CORE_PERMISSIONS.has(p);
}

/**
 * The helper that must be declared for this permission, or null if it isn't
 * helper-provided. The namespace IS the helper id — derived, never a hardcoded map, so
 * the two can't drift apart.
 */
export function helperIdForPermission(p: string): string | null {
  if (isCorePermission(p)) return null;
  if (!HELPER_PERMISSION_RE.test(p)) return null;
  return p.slice(0, p.indexOf(":"));
}

/** Shape a manifest/definition permission list must satisfy to be accepted at all. */
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

/** A module's own settings (declared in `settings`), scoped to the module. */
export type ModuleSettingsApi = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  all(): Promise<Record<string, unknown>>;
};

/** Generic per-module key/value store (no migration needed). */
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

/** Send mail through the admin's configured mailer ("email:send"). */
export type ModuleEmailApi = {
  /** Throws if email isn't configured yet or the send fails — never fails silently. */
  send(msg: { to: string; subject: string; text?: string; html?: string }): Promise<void>;
};

/**
 * Network probes `fetch` can't express ("network:outbound"). ICMP lives here because it
 * needs the OS `ping` binary: doing that safely (strict host validation, fixed argument
 * list, no shell) belongs in trusted core code once, not copied into every module.
 */
export type ModuleNetApi = {
  /** ICMP echo. Resolves round-trip milliseconds, or null if the host didn't answer. */
  ping(host: string, opts?: { timeoutMs?: number }): Promise<number | null>;
};

/**
 * The capability-scoped context handed to a module's hooks + data functions. Optional
 * members are present ONLY when the corresponding permission was granted.
 */
export type ModuleContext = {
  moduleId: string;
  /** The current signed-in user (in a request context), or null. */
  user: { id: string; email: string; role: "ADMIN" | "USER" } | null;

  settings: ModuleSettingsApi;
  store: ModuleStoreApi;

  db?: ModuleDbApi; // only when the module ships migrations
  crypto?: { encrypt(s: string): string; decrypt(s: string): string }; // "crypto:use"
  fetch?: typeof fetch; // "network:outbound"
  net?: ModuleNetApi; // "network:outbound"
  email?: ModuleEmailApi; // "email:send"
  audit?: (action: string, detail?: string) => Promise<void>; // "audit:write"
};

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
 * The default export of `modules/<id>/module.ts`. `id` is a stable lowercase-kebab
 * string equal to the folder name.
 */
export type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  version: string; // semver
  minAppVersion: string; // minimum JonDash version required
  permissions: DeclaredPermission[];

  /**
   * Helper ids this module needs (MOD-08). Declaring one lets the module import
   * `@/helpers/<id>/api` — the verifier refuses that import otherwise — and lets it
   * declare the permissions that helper provides. The manifest entry must match exactly,
   * the same rule permissions follow.
   */
  helpers?: string[];

  /**
   * Periodic work, DECLARED rather than started by the module (MOD-08). The scheduler
   * helper collects these at server boot and runs them — so a module's background work
   * runs from the moment the server starts, not from the first time somebody renders its
   * widget. Requires declaring the "scheduler" helper.
   *
   * Declarative on purpose: a module never gets to run arbitrary code at boot, and the
   * schedule is inspectable without executing anything.
   */
  schedules?: ModuleSchedule[];

  /** Restrict all of the module's UI to full admins. */
  adminOnly?: boolean;

  /** Declared settings; auto-rendered under Admin → Modules → <module> unless a
   *  custom SettingsPanel is provided. */
  settings?: ModuleSettingField[];

  /**
   * Optional icon for the module, shown next to its name. A component (usually an inline
   * SVG) rather than an image file, so it ships with the module, needs no upload or
   * serving route, and inherits the current theme's colour via `currentColor`.
   */
  icon?: ComponentType<{ className?: string }>;

  /** Optional UI extension points. */
  DashboardWidget?: ComponentType<ModuleWidgetProps>;
  Page?: ComponentType<ModulePageProps>;
  SettingsPanel?: ComponentType<ModuleSettingsPanelProps>;

  /** Path (relative to the module folder) to a dir of `NNN_name.sql` migrations for
   *  the module's own `mod_<id>_*` tables. */
  migrations?: string;

  /** Optional lifecycle hooks. The framework already purges the module's settings,
   *  generic store, and `mod_<id>_*` tables on uninstall — use onUninstall only for
   *  extra cleanup. */
  onEnable?: (ctx: ModuleContext) => Promise<void>;
  onDisable?: (ctx: ModuleContext) => Promise<void>;
  onUninstall?: (ctx: ModuleContext) => Promise<void>;
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

/** Human-readable, one-line warning shown at install for each permission. */
export const PERMISSION_WARNINGS: Record<ModulePermission, string> = {
  "network:outbound": "Connect out to other servers (web requests, and raw TCP, DNS, TLS and ping checks)",
  "crypto:use": "Encrypt and decrypt data with your app's key",
  "audit:write": "Add entries to your audit log",
  "email:send": "Send email using your configured mail account",
};

/**
 * Permissions flagged as high-risk (highlighted red in the consent screen). Empty for
 * now — everything currently grantable is comparatively low-risk. The set exists because
 * the genuinely dangerous capabilities (user-account access, reading the raw key) are
 * exactly the ones still to be built, and they must be highlighted the day they land.
 */
export const DANGEROUS_PERMISSIONS: ReadonlySet<ModulePermission> = new Set<ModulePermission>([]);

/**
 * Resolve any declared permission to the sentence an admin reads, plus whether to
 * highlight it. **The single place consent text is decided** — every surface (browse,
 * module page, update approval) goes through this, so none of them can quietly render a
 * blank for a permission core doesn't recognise.
 *
 * `helperLabels` maps a helper-provided permission id to the wording the HELPER supplied.
 * A helper-provided capability is **dangerous by default**: core has no opinion about a
 * capability it didn't define, so it never gets the quiet styling.
 *
 * When a label is missing the permission is still shown — named, flagged, and honestly
 * described as unexplained. Silently dropping it is the failure this whole feature exists
 * to remove.
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

/** Re-exported for convenience where a widget/panel returns markup. */
export type ModuleRenderable = ReactNode;
