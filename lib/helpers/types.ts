import type { DeclaredPermission, ModuleContext } from "@/lib/modules/types";

/**
 * Helper contract (MOD-08). See docs/HELPERS-DESIGN.md for the reasoning.
 *
 * A helper is FIRST-PARTY code that does, on a module's behalf, the privileged work
 * modules are forbidden — filesystem, process spawning, raw sockets. That is only safe
 * because helpers can be authored by JonDash alone and installed only from the official
 * source; that restriction is load-bearing and must never be relaxed for convenience.
 *
 * Deliberately NOT a `ModuleDefinition`: a helper has no widget, no page, no settings and
 * no RBAC. It exists to be called by modules that declared it.
 */

/** A capability a helper exposes, described for the consent screen. */
export type HelperCapability = {
  /**
   * The permission a consuming module must declare to use it — `<thisHelperId>:<verb>`
   * (e.g. `filesystem:write`). Namespaced to the helper so two helpers can never collide
   * and none can shadow a core permission; validated at install, not merely by convention.
   *
   * A helper may name a capability core has never heard of. That is deliberate — it is
   * what lets a new capability ship without a core release. Core does not enforce it; the
   * helper does, behind its own narrow API. See `DeclaredPermission` in modules/types.ts.
   */
  permission: DeclaredPermission;
  /**
   * The real-world effect, in plain language, shown to the admin — "Read and write files
   * in D:\Backups", not "filesystem access". A capability name tells nobody what could
   * happen to their machine. `describe` receives the helper's current configuration so
   * the sentence can name the actual directories in play.
   */
  describe: (config: Record<string, unknown>) => string;
};

/** What a helper's boot phase is given. Deliberately tiny. */
export type HelperBootContext = {
  helperId: string;
  /** Scoped raw-SQL access to the helper's own `hlp_<id>_*` tables (if it ships migrations). */
  db?: {
    table(name: string): string;
    query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;
    run(sql: string, ...params: unknown[]): Promise<void>;
  };
  /** Write an audit entry attributed to the helper, with no user. */
  audit(action: string, detail?: string): Promise<void>;
};

export type HelperDefinition = {
  id: string;
  name: string;
  description: string;
  version: string;
  minAppVersion: string;

  /** Capabilities exposed to consuming modules. Empty for a helper that needs no consent
   *  (a scheduler is not dangerous; a filesystem helper is). */
  provides?: HelperCapability[];

  /** Path (relative to the helper folder) to `NNN_name.sql` migrations for its own
   *  `hlp_<id>_*` tables. */
  migrations?: string;

  /**
   * Runs ONCE per server start, before requests are served (Next `instrumentation.ts`).
   *
   * It must **register intent and return** — start a timer, not do the work. Everything
   * here delays the server becoming ready, and a helper that throws must never be the
   * reason the dashboard won't start, so failures are isolated and logged rather than
   * fatal.
   */
  onBoot?: (ctx: HelperBootContext) => Promise<void>;
};

/**
 * The shape a helper's public entry point exports. A module imports
 * `@/helpers/<id>/api` — a declared entry point, so a helper can refactor its internals
 * without breaking consumers — and the verifier permits that import only for helper ids
 * the module actually declared.
 *
 * Every call takes the CONSUMING module's context, so the helper always knows who is
 * asking and can refuse work the caller wasn't granted.
 */
export type HelperApiFor<T> = (ctx: ModuleContext) => T;
