import type { ComponentType } from "react";
import type {
  BackupTableDecl,
  DeclaredPermission,
  ModuleContext,
  UninstallQuestion,
} from "@/lib/modules/types";

/**
 * ⚠ `user` is resolved by core from the session, never passed by a caller — a module-supplied
 *   `ctx.user` is forgeable, which is the bug this feature exists to fix.
 * REFS app/admin/helpers/actions.ts › saveHelperSettingsAction() — the only builder of this
 * PINS tests/unit/helper-settings.test.ts
 */
export type HelperSettingsContext = {
  helperId: string;
  user: { id: string; email: string; role: "ADMIN" | "USER" };
};

/**
 * What a settings submission produced. ⚠ `error` is shown to the admin verbatim.
 * REFS app/admin/helpers/actions.ts · app/admin/permissions/actions.ts — both render it
 */
export type HelperSettingsResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * One member of the set that bounds a capability — a service, a folder.
 *
 * ⚠ `label` and `value` are separate deliberately, and **both are always shown**: a module once
 *   displayed "Add Plex" while submitting `sshd`. A friendly name is never the only thing on
 * screen. REFS app/admin/permissions/ui.tsx — renders both · app/admin/permissions/actions.ts —
 * acts on `value`
 *
 */
export type ScopeItem = {
  /** Stable identifier for removal. Opaque to core. */
  id: string;
  /** Human wording. May be anything; never the only thing displayed. */
  label: string;
  /** What is actually acted on — a service name, an absolute path. Rendered verbatim. */
  value: string;
  /** Optional extra, e.g. "added 3 March, runs unattended". */
  detail?: string;
  /**
   * State of the per-item switch, when the capability declares `itemToggle`.
   * ⚠ Carried on the item, never fetched per row — a separate read could disagree with the list it
   *   is drawn beside, and on this screen two sources that can differ is the bug.
   */
  toggleOn?: boolean;
};

/**
 * Something the admin could add, offered for ticking rather than typing. Both fields shown, as
 * `ScopeItem`. REFS app/admin/permissions/ui.tsx — the picker · app/admin/permissions/actions.ts
 */
export type ScopeCandidate = {
  value: string;
  label: string;
  /**
   * Optional context that helps the choice — "Running", "12 GB free", "not currently installed".
   */
  detail?: string;
  /** Already on the list. Core shows it ticked and disabled rather than hiding it. */
  alreadyAdded?: boolean;
};

/**
 * The bounding set, declared so **core** renders and edits it rather than a bespoke helper panel.
 *
 * ⚠ CORE-10: the switch and the set it bounds must appear on the SAME screen. A bound living
 *   somewhere other than where the admin looks is a bug this project has hit twice.
 * REFS app/admin/permissions/ui.tsx — the screen · app/admin/permissions/actions.ts — the gated
 * writes
 *
 */
export type HelperCapabilityScope = {
  /** Singular noun for UI wording — "service", "folder", "package". */
  noun: string;
  /** Placeholder / help text for the add field. */
  addHint?: string;
  /**
   * Adding or removing raises an elevation prompt: core warns first and allows the longer budget.
   */
  mayPrompt?: boolean;
  /** Current members. ⚠ Bounded and best-effort — throwing must not take the page down. */
  list: () => Promise<ScopeItem[]>;

  /**
   * Candidates to tick instead of typing. `query` is the filter text; return a sensible number.
   *
   * ⚠ **A safety feature, not a convenience: a helper offering `unbounded` and no `browse` has
   *   built the trap** — typing three exact service names loses to the one-click "everything"
   *   below. Bounded and best-effort; failing shows the manual field, never an error page.
   */
  browse?: (query: string) => Promise<ScopeCandidate[]>;

  /**
   * This capability CAN be granted with no list at all. **Omit it and the capability is always
   * bounded** — the safer default. Core renders it apart from the list; the helper enforces it.
   */
  unbounded?: {
    /**
     * What the grant reaches, verbatim beside the switch. **Name the worst thing it can touch.**
     *
     * ⚠ Where "everything" includes JonDash's own `.data/`, `prisma/` or `bin/` — the master key,
     *   the database, the elevation binaries — **it does, and this must say so.** It is the only
     *   sentence the admin reads before agreeing. Where `option` exists, describe the grant
     ***without** it. 
     *
     *
     */
    warning: string;
    isOn: () => Promise<boolean>;
    set: (ctx: HelperSettingsContext, on: boolean) => Promise<HelperSettingsResult>;

    /**
     * One dependent boolean qualifying the *grant*, shown under the switch only while it is on —
     * e.g. "exclude JonDash's own data", defaulting to protected, which keeps the sentence beside
     * the switch true in **both** states. It qualifies the grant, not the list, so it lives here
     * rather than on `scope`.
     *
     * ⚠ **The confirm asymmetry INVERTS here**: this option protects, so OFF is the widening
     *   direction and OFF is what core confirms. Backwards puts the friction on the safe move.
     */
    option?: {
      /** What the protection does, e.g. "Exclude JonDash's own data". */
      label: string;
      /** Shown on the confirm step when switching the protection OFF — the widening direction. */
      warning?: string;
      isOn: () => Promise<boolean>;
      set: (ctx: HelperSettingsContext, on: boolean) => Promise<HelperSettingsResult>;
    };
  };
  /**
   * A switch on each member rather than on the capability — membership is not always the only
   * decision. `host-services` approves a service, then asks whether a module may act on it without
   * prompting each time. State comes from `ScopeItem.toggleOn`, not a callback here.
   *
   * ⚠ Core confirms ON and applies OFF immediately: widening asks, narrowing does not.
   */
  itemToggle?: {
    /** What the switch means, e.g. "Allow without asking". Shown against every item. */
    label: string;
    /** Shown when switching one ON. Name what is given up — here, the per-action prompt stops. */
    warning?: string;
    set: (ctx: HelperSettingsContext, id: string, on: boolean) => Promise<HelperSettingsResult>;
  };

  /**
   * ⚠ Core calls these through its own gated action — **a helper may never define a server action
   *   for them.** A check that must be remembered is eventually forgotten.
   * REFS app/admin/permissions/actions.ts — the gated caller
   */
  add: (ctx: HelperSettingsContext, value: string) => Promise<HelperSettingsResult>;
  remove: (ctx: HelperSettingsContext, id: string) => Promise<HelperSettingsResult>;
};

/*
 * Helper contract (MOD-08). A helper is FIRST-PARTY code doing, on a module's behalf, the
 * privileged work modules are forbidden — filesystem, process spawning, raw sockets. Not a
 * `ModuleDefinition`: no widget, no page, no RBAC.
 *
 * ⚠ Only safe because helpers are authored by JonDash alone and installed only from the official
 *   source. That restriction is load-bearing and must never be relaxed for convenience.
 * REFS lib/modules/sources.ts › fetchSourceManifest() — enforces first-party-only at install
 *      docs/HELPERS-DESIGN.md · docs/MODULES-AUTHORING.md — ⚠ author-facing, update with this
 */

/**
 * A capability a helper exposes, described for the consent screen.
 * REFS lib/modules/context.ts — where a module's grant of one is resolved
 */
export type HelperCapability = {
  /**
   * `<thisHelperId>:<verb>`, e.g. `filesystem:write`. Namespaced so two helpers cannot collide and
   * none can shadow a core permission. A helper may name a capability core has never heard of —
   * that is what lets one ship without a core release; the helper enforces it behind its own API.
   *
   * ⚠ **Split read from write, always** — `:read` and `:control` as separate capabilities, never
   *   one covering both, or the admin must grant the destructive half to get the harmless one.
   *   **Core never sees the verbs and cannot enforce this**, so it is a contract obligation.
   * REFS lib/modules/types.ts › helperIdForPermission() — derives the helper from the namespace
   */
  permission: DeclaredPermission;
  /**
   * The real-world effect in plain language — "Read and write files in D:\Backups", not "filesystem
   * access", because a capability name tells nobody what could happen to their machine. Receives
   * the helper's config so the sentence names the actual directories. ⚠ Bounded and best-effort.
   */
  describe: (config: Record<string, unknown>) => string;

  /**
   * Short label — "Control Windows services". Falls back to the key, which tells a person nothing.
   */
  label?: string;

  /**
   * Damage if misused, for ordering and emphasis. `high` means "could compromise the machine or the
   * install". ⚠ Do not reach for it merely to draw attention.
   */
  risk?: "low" | "medium" | "high";

  /**
   * The bounding set, if any — see `HelperCapabilityScope`. Omit for a simple on/off capability.
   */
  scope?: HelperCapabilityScope;
};

/**
 * What a helper's boot phase is given. Deliberately tiny.
 * REFS lib/helpers/boot.ts — the only builder, and it isolates failures
 */
export type HelperBootContext = {
  helperId: string;
  /**
   * Scoped raw SQL over its own `hlp_<id>_*` tables only. REFS lib/helpers/migrate.ts ›
   * helperTableName()
   *
   */
  db?: {
    table(name: string): string;
    query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;
    run(sql: string, ...params: unknown[]): Promise<void>;
  };
  /** Write an audit entry attributed to the helper, with no user. */
  audit(action: string, detail?: string): Promise<void>;
};

/**
 * The default export of `helpers/<id>/helper.ts`.
 * REFS lib/helpers/registry.ts — reads them · lib/helpers/boot.ts — runs `onBoot` ·
 *      lib/helpers/migrate.ts — runs `migrations` · scripts/gen-module-registry.mjs — generates
 *      the static import list, since helpers compile into the build
 */
export type HelperDefinition = {
  id: string;
  name: string;
  description: string;
  version: string;
  /**
   * The oldest JonDash this helper may be installed on.
   *
   * ⚠ **Every optional field here is optional to OMIT, never to ADD.** Helpers compile into the
   *   app, so declaring a property an older core lacks is a failed build, not a plainer UI — and
   *   the floor **propagates**: every consuming module needs it too, or it pulls the helper onto an
   *   older core and takes the build down. Floors:
   *   `label`/`risk`/`scope`/`browse`/`unbounded`/`itemToggle` 1.7.2-beta.1; `unbounded.option`
   * 1.7.2-beta.2. REFS lib/helpers/install.ts — enforces this at install
   */
  minAppVersion: string;

  /** Capabilities exposed to modules. Empty for a helper needing no consent, e.g. a scheduler. */
  provides?: HelperCapability[];

  /**
   * The helper's own config, so `describe(config)` names real specifics (MOD-10). **Core cannot
   * read it** — a helper's config lives in its own `hlp_<id>_*` tables — so the helper hands over
   * only what consent needs. ⚠ Bounded and best-effort: throwing falls back to generic wording,
   * never an error.
   *
   */
  readConfig?: () => Promise<Record<string, unknown>>;

  /** Relative path to `NNN_name.sql` migrations. REFS lib/helpers/migrate.ts — runs them */
  migrations?: string;

  /**
   * Which `hlp_<id>_*` tables belong in a backup (OPS-16). Logical un-prefixed names; **undeclared
   * means not exported**; `secret` columns kept in an encrypted backup and blanked from a plain
   * one.
   *
   * REFS lib/backup-addons.ts — the implementation · lib/helpers/migrate.ts › helperTableName() —
   *      resolves the physical name · lib/modules/types.ts › ModuleDefinition.backup — same rules
   */
  backup?: { tables: BackupTableDecl[] };

  /**
   * Runs ONCE per server start, before requests are served.
   * ⚠ **Register intent and return** — start a timer, do not do the work. Everything here delays
   *   readiness, and a helper must never be the reason the dashboard will not start.
   * REFS lib/helpers/boot.ts — the caller; isolates and logs failures rather than throwing
   */
  onBoot?: (ctx: HelperBootContext) => Promise<void>;

  /**
   * Runs ONCE, just before the helper's files are removed. **For state created OUTSIDE JonDash** —
   * an OS grant, a scheduled task, a firewall rule (OPS-18). Its own tables are deliberately left
   * alone, so reinstalling brings the helper back with its history.
   *
   * ⚠ Best-effort and **must not block removal**, so it is a tidy-up, **not a guarantee**: anything
   *   that MUST be revoked has to be revocable independently.
   * REFS lib/helpers/install.ts › pruneUnusedHelpers() — the caller
   */
  onUninstall?: (ctx: HelperBootContext, answers: Record<string, boolean>) => Promise<void>;

  /**
   * A bound service account has been deleted (SEC-07) — fired after the identity is gone, so a
   * helper can drop key rows and stop showing a credential pointing at nothing.
   *
   * ⚠ **Hygiene, never the safety property.** It is skipped entirely if the server is down when the
   *   deletion happens. The guarantee is re-resolving on **every call** and failing closed.
   * REFS lib/auth/service-accounts.ts › resolveBindableAccount() — the actual guarantee
   */
  onIdentityRemoved?: (ctx: HelperBootContext, accountId: string) => Promise<void>;

  /**
   * Questions for the uninstall confirmation screen; replies arrive in `onUninstall`. Built for
   * "withdraw the Windows permissions?" and "remove the software JonDash installed?" — both need a
   * person, and the person is only present here. ⚠ Bounded and best-effort: throwing shows the
   * uninstall *without* questions rather than blocking it.
   *
   * REFS lib/modules/types.ts › UninstallQuestion — `default: true` is honoured for helpers
   *      (first-party) and forced false for modules
   */
  uninstallQuestions?: () => Promise<UninstallQuestion[]>;

  /**
   * A settings panel rendered by CORE, so admin-owned configuration is edited on a core page behind
   * a core permission check, **with no module anywhere in the path**. Without it a helper exposed
   * its allowlist on its module-facing API and **the thing being bounded could edit its own
   * boundary**.
   *
   * ⚠ A client component that must submit through `saveHelperSettingsAction` — never its own
   * action. REFS app/admin/helpers/actions.ts › saveHelperSettingsAction()
   */
  SettingsPanel?: ComponentType<{ ctx: HelperSettingsContext }>;

  /**
   * Receives what the panel submitted. Called ONLY by `saveHelperSettingsAction`, which has already
   * checked same-origin and the admin permission and built `ctx` from the real session.
   *
   * ⚠ **A helper may not define its own server action for this.** It is first-party and *could* —
   *   and that is the point: the gated path being the only path means the check cannot be
   * forgotten.
   *
   */
  onSettingsSubmit?: (
    ctx: HelperSettingsContext,
    payload: Record<string, unknown>,
  ) => Promise<HelperSettingsResult>;

  /**
   * `onUninstall` may raise an elevation prompt, so its budget becomes 10 minutes rather than 5
   * seconds. Revoking a grant waits on a human answering UAC, so the 5s budget cut the hook off
   * mid-prompt and the grants survived. Acceptable **here and only here**, because the admin has
   * just clicked uninstall and is at the machine.
   *
   * ⚠ **Never set this to buy time for ordinary work** — it is an attention span, not a performance
   *   allowance. REFS lib/elevation.ts — where the 10-minute timeout comes from
   */
  uninstallMayPrompt?: boolean;
};

/**
 * A helper's public entry point. A module imports `@/helpers/<id>/api` — declared, so internals can
 * be refactored without breaking consumers.
 *
 * ⚠ Every call takes the **consuming module's** context, so the helper knows who is asking and can
 *   refuse work the caller was not granted.
 * REFS lib/modules/verify.ts — permits that import only for helpers the module declared
 */
export type HelperApiFor<T> = (ctx: ModuleContext) => T;
