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

/** One block of label/value rows in a module's email — a digest, a list of failures. */
export type ModuleMailList = {
  heading: string;
  rows: { label: string; value: string; state?: "ok" | "warn" | "bad" }[];
};

/**
 * Send mail through the admin's configured mailer ("email:send").
 *
 * **Core owns the chrome; the module supplies the body** (1.8.0). A module passes text — plus,
 * optionally, some structured rows and one call to action — and JonDash wraps it in the same
 * branded shell as its own mail, in the instance's style and colour.
 *
 * That split is not tidiness. It means a module cannot ship mail that renders badly in Outlook,
 * and cannot produce a message that looks like it came from JonDash itself when it did not:
 * `text` is HTML-escaped before it is wrapped, so markup in a module's body arrives as visible
 * text rather than as markup.
 *
 * **Do not hard-wrap `text`.** Blank line → paragraph, single newline → line break. A body wrapped
 * at 78 characters becomes a forced break mid-sentence, and the client then wraps again at its own
 * width.
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
     * Optional single call to action. **`path` only** — a module cannot know the install's
     * external address (it changes behind a reverse proxy or a custom domain), so core resolves
     * it. Anything that isn't a root-relative path is dropped rather than sent as a broken link.
     */
    cta?: { label: string; path: string };
    /**
     * Escape hatch: send raw HTML and skip the branded shell entirely. Exists only for a module
     * that genuinely must control the whole message; using it means Outlook rendering and
     * looking like JonDash both become the module's problem.
     */
    html?: string;
  }): Promise<void>;
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

  /**
   * Everything this module was actually granted, and a predicate over it (MOD-10).
   *
   * **Why this exists, when the fields below already gate core capabilities.** A core
   * permission is enforced *structurally*: `ctx.fetch` is simply absent unless
   * `network:outbound` was granted, so there is nothing to check and nothing to forget.
   * A HELPER's API is different — a module imports it directly from `@/helpers/<id>/api`,
   * so no field can be withheld. The verifier gates that import on the module declaring
   * the helper, but that is one binary gate on the whole helper, not per capability.
   *
   * Without this, a module could declare only `filesystem:read` and then call every write
   * method on the helper, with nothing able to notice. `can()` lets a helper refuse an
   * operation whose capability its caller never declared.
   *
   * Helpers: check `ctx.can(...)` at the top of every privileged call. Core cannot do it
   * for you, because core never sees the call.
   *
   * ⚠ **ADVISORY, NOT A SECURITY BOUNDARY — and it reads like one, so this matters.**
   * The MODULE is what hands this object to the helper, and JavaScript cannot stop it
   * handing over a lookalike: `helperApi({ ...ctx, can: () => true })` defeats the check
   * completely. Freezing `grants` does not help — a spread builds a NEW object rather than
   * mutating the frozen one. `moduleId` is forgeable the same way, so a helper's audit
   * attribution can be misdirected too.
   *
   * This is consistent with the framework's stated posture (guardrails for curated
   * modules, not a hard sandbox) and it stops honest mistakes, which is most of the value.
   * But `ctx.fetch` being absent is enforcement, and this is not — do not describe it as
   * though it were. Raised by the add-ons session, 2026-07-23, after they built against it.
   *
   * The shape that WOULD be a boundary already exists in this framework: core hands the
   * helper's API over as a field on the context, present only when granted, exactly like
   * `ctx.fetch` — so the module never constructs the object the helper sees. Tracked as
   * MOD-11; deliberately not a 1.5.2 change.
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

/** A helper a module needs, stating the oldest version it was built against (MOD-10). */
export type ModuleHelperNeed = {
  id: string;
  /** Oldest helper version this module works with. Omit if it has no floor. */
  minVersion?: string;
};

/** The plain id of a declared helper, whichever form was used. */
export function helperNeedId(h: string | ModuleHelperNeed): string {
  return typeof h === "string" ? h : h.id;
}

/** Just the ids of a module's declared helpers — what most callers want. */
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
 * One table an add-on wants carried in backups (OPS-16). Declared by modules *and* helpers, so it
 * lives here — the shared contract file — rather than beside the backup code, which is
 * `server-only` and would break any client component that touched a definition.
 */
export type BackupTableDecl = {
  /** The logical, un-prefixed name used in the add-on's own migrations. */
  name: string;
  /** Columns holding credentials or tokens: kept in an encrypted backup, blanked from a plain one. */
  secret?: string[];
};

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
   * Helpers this module needs (MOD-08). Declaring one lets the module import
   * `@/helpers/<id>/api` — the verifier refuses that import otherwise — and lets it
   * declare the permissions that helper provides. The manifest entry must match exactly,
   * the same rule permissions follow.
   *
   * A bare id says "I need this helper". The object form (MOD-10) additionally states the
   * oldest helper version this module was built against:
   *
   * ```ts
   * helpers: ["scheduler"]                                  // no floor stated
   * helpers: [{ id: "scheduler", minVersion: "0.0.3" }]      // needs 0.0.3+
   * ```
   *
   * Stating a floor is optional and additive — every existing module uses the bare form.
   * It buys two things: an installed helper that is too OLD is reported instead of the
   * module silently misbehaving, and when a helper does have to break compatibility for a
   * security fix, JonDash can name exactly which modules that breaks.
   */
  helpers?: (string | ModuleHelperNeed)[];

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

  /**
   * Which of this module's own `mod_<id>_*` tables belong in a backup (OPS-16).
   *
   * Table names are **logical and un-prefixed** — the same names the module's migrations use —
   * and core resolves them through `moduleTableName()`, so a module never writes the physical
   * name and the two halves can never drift apart.
   *
   * **Undeclared means not exported.** A module's tables are its own; core takes a copy only where
   * asked to, and names anything it skipped in the restore report rather than deciding for you.
   *
   * `secret` lists columns holding credentials or tokens. They follow core's rule, which is not
   * discoverable from a module's side: **present in an encrypted backup, blanked out of an
   * unencrypted one.**
   *
   * ```ts
   * backup: { tables: [{ name: "checks" }, { name: "targets", secret: ["apiKey"] }] }
   * ```
   *
   * **Restored only into the same module version.** The rows carry the version that produced them
   * and are written back only on an exact match; anything else is skipped and reported, because
   * core cannot know whether an upgrade changed a column, and writing rows into a schema that no
   * longer fits them corrupts a module rather than restoring it.
   */
  backup?: { tables: BackupTableDecl[] };

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
  /**
   * `answers` carries the replies to `uninstallQuestions`, keyed by question id. A question
   * that was never asked — or that core dropped — is simply absent, so read defensively.
   */
  onUninstall?: (ctx: ModuleContext, answers: Record<string, boolean>) => Promise<void>;

  /**
   * Questions to put on the uninstall confirmation screen, answered while the admin is still
   * there. The replies arrive in `onUninstall`.
   *
   * For decisions core cannot make and should not guess: "also remove Docker Desktop?" — wrong
   * to do automatically (it is the admin's software, probably in use, and a dashboard module
   * being removed is no reason to delete it) and wrong to skip silently.
   *
   * **A MODULE IS THIRD-PARTY CODE PUTTING TEXT ON A CORE ADMIN SCREEN**, so core constrains it:
   *  - **Attributed.** Every question is labelled with the module that asked it, so nobody reads
   *    a module's wording as JonDash speaking.
   *  - **Text, never markup.** Rendered as a string; no interpolation of HTML.
   *  - **`default: true` is ignored for modules** and forced to false. A third party does not get
   *    to pre-tick a box on a destructive screen. (Helpers are first-party and may default true.)
   *  - **Ten questions maximum.** A module cannot make the confirmation unusable.
   *  - **Bounded and best-effort**, like `readConfig`: throwing or hanging shows the uninstall
   *    *without* questions rather than blocking it.
   *
   * A "yes" grants no capability the module did not already have — it is a prompt to use
   * something the admin consented to at install, not a new permission.
   */
  uninstallQuestions?: () => Promise<UninstallQuestion[]>;
};

/** One yes/no question on the uninstall confirmation screen. */
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

/**
 * How much a module is asking for, as one word — for a catalogue card, where there is no room for
 * the sentences `describePermission` produces.
 *
 * **Derived from the same data as the full list, deliberately.** A chip summarises a consent
 * decision, and a summary computed separately from the thing it summarises is free to drift from
 * it — the card would read "Standard" while the detail page listed something alarming. This runs
 * the same permissions through the same `describePermission`, so a chip can only ever be a lossy
 * view of what the detail page spells out.
 *
 * **A chip is never enough to install on.** It says roughly how much is being asked for so a
 * catalogue can be skimmed; approving happens where the full list is on screen.
 */
export type PermissionRisk = "none" | "standard" | "elevated";

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
