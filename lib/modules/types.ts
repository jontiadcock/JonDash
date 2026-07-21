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
export type ModulePermission =
  | "network:outbound" // outbound connections: ctx.fetch, raw TCP/DNS/TLS, ctx.net.ping
  | "db:users:read" // read user accounts (ctx.usersDb)
  | "db:users:write" // modify user accounts (sensitive)
  | "db:core:read" // read other core tables
  | "db:core:write" // modify other core tables (sensitive)
  | "crypto:use" // encrypt/decrypt with the app key (ctx.crypto)
  | "crypto:key:read" // read the raw encryption key — DANGEROUS, avoid
  | "sessions:read" // see active sessions
  | "sessions:manage" // revoke sessions (sensitive)
  | "files:read" // read the uploads/filesystem area
  | "files:write" // write the uploads/filesystem area
  | "audit:write" // write audit-log entries (ctx.audit)
  | "email:send"; // send email via the admin's configured mailer

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
  usersDb?: unknown; // "db:users:*" — shape defined as the runtime lands
  audit?: (action: string, detail?: string) => Promise<void>; // "audit:write"
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
  permissions: ModulePermission[];

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
  grantedPermissions: ModulePermission[];
  installedAt: string;
};

/** Human-readable, one-line warning shown at install for each permission. */
export const PERMISSION_WARNINGS: Record<ModulePermission, string> = {
  "network:outbound": "Connect out to other servers (web requests, and raw TCP, DNS, TLS and ping checks)",
  "db:users:read": "Read your user accounts",
  "db:users:write": "Create, modify or delete your user accounts",
  "db:core:read": "Read other app data",
  "db:core:write": "Modify other app data",
  "crypto:use": "Encrypt and decrypt data with your app's key",
  "crypto:key:read": "Read your raw encryption key (full access to all secrets)",
  "sessions:read": "See who is signed in",
  "sessions:manage": "Sign other people out",
  "files:read": "Read uploaded files",
  "files:write": "Write files to the app's storage",
  "audit:write": "Add entries to your audit log",
  "email:send": "Send email using your configured mail account",
};

/** Permissions flagged as high-risk (highlighted red in the consent screen). */
export const DANGEROUS_PERMISSIONS: ReadonlySet<ModulePermission> = new Set<ModulePermission>([
  "db:users:write",
  "db:core:write",
  "crypto:key:read",
  "sessions:manage",
]);

/** Re-exported for convenience where a widget/panel returns markup. */
export type ModuleRenderable = ReactNode;
