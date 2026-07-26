import type { ComponentType } from "react";
import type { DeclaredPermission, ModuleContext, UninstallQuestion } from "@/lib/modules/types";

/**
 * What a helper's settings panel is given.
 *
 * **`user` is resolved by core from the session**, not passed in by a caller. That distinction
 * is the whole point: the bug that prompted this feature had a helper trusting a `ctx.user` that
 * a module supplied, which was forgeable exactly as `ctx.can` was.
 */
export type HelperSettingsContext = {
  helperId: string;
  user: { id: string; email: string; role: "ADMIN" | "USER" };
};

/** What a settings submission produced. `error` is shown to the admin verbatim. */
export type HelperSettingsResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * One member of the admin-owned set that bounds a capability — a service `host-services` may
 * control, a folder `filesystem` may reach.
 *
 * **`label` and `value` are separate on purpose.** A label is for reading; `value` is what will
 * actually be acted on, and the Permissions page shows it verbatim next to the label. The bug
 * that produced this whole area was a module displaying "Add Plex" while submitting `sshd` — so
 * anywhere a set member is shown, the real value is shown too, and a friendly name can never be
 * the only thing on screen.
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
   * Current state of the per-item switch, when the capability declares `itemToggle`.
   *
   * **Carried on the item rather than fetched per row on purpose.** The helper already knows this
   * when it builds the list, so reading it here costs one call instead of one-per-item, and — the
   * reason that matters — a separate read could disagree with the list it is drawn beside. On a
   * screen whose entire job is showing what something is allowed to do, two sources that can
   * differ is the bug, not the round trip.
   */
  toggleOn?: boolean;
};

/**
 * Something the admin could add, offered for ticking rather than typing.
 *
 * `value` is what gets added; `label` is for reading. Both are shown, for the same reason they
 * are on `ScopeItem` — a friendly name must never be the only thing on screen when the thing
 * being agreed to is the value.
 */
export type ScopeCandidate = {
  value: string;
  label: string;
  /** Optional context that helps the choice — "Running", "12 GB free", "not currently installed". */
  detail?: string;
  /** Already on the list. Core shows it ticked and disabled rather than hiding it. */
  alreadyAdded?: boolean;
};

/**
 * The admin-owned set that bounds a capability, declared so **core** can render and edit it.
 *
 * Before this, each helper shipped a bespoke settings panel, which meant the only generic thing
 * core could show about a capability was its name. The owner's requirement (CORE-10) is that the
 * switch and the set it bounds appear on the SAME screen — because a bound that lives somewhere
 * other than where the admin looks is the bug this project has now hit twice.
 */
export type HelperCapabilityScope = {
  /** Singular noun for UI wording — "service", "folder", "package". */
  noun: string;
  /** Placeholder / help text for the add field. */
  addHint?: string;
  /**
   * True when adding or removing raises an elevation prompt. Core warns before the click and
   * allows the longer budget, rather than a prompt appearing unexplained.
   */
  mayPrompt?: boolean;
  /** Current members. Read on an admin screen: bounded, best-effort, never blocks the page. */
  list: () => Promise<ScopeItem[]>;

  /**
   * Candidates the admin can tick, so nobody has to type a service name or a path by hand.
   *
   * **This is a safety feature, not a convenience.** Owner, 2026-07-26: *"I want the add/remove
   * to be a lot easier so people aren't driven to use it"* — "it" being the unbounded switch
   * below. If picking three services means typing three exact names correctly, the one-click
   * "everything" option wins, and a bounded capability loses to a blunt one because of typing.
   * A helper that offers `unbounded` and no `browse` has built the trap.
   *
   * `query` is whatever the admin typed to filter; return a sensible number of matches rather
   * than every service on the machine. Called on an admin screen, so bounded and best-effort:
   * failing here shows the manual field, never an error page.
   */
  browse?: (query: string) => Promise<ScopeCandidate[]>;

  /**
   * Declares that this capability CAN be granted with no list at all — every service, every
   * path. Omit it and the capability is always bounded, which is the safer default.
   *
   * Core renders this apart from the list, styled as the serious choice it is, and shows
   * `warning` verbatim. The helper enforces it and decides what it means.
   */
  unbounded?: {
    /**
     * What granting this actually reaches, in plain words — shown verbatim beside the switch.
     * Name the worst thing it can touch, not the average one.
     *
     * **Owner decision, 2026-07-26:** where "everything" would include JonDash's own `.data/`,
     * `prisma/` or `bin/`, it does — the switch is not quietly carved out — **and the warning must
     * say so**. Those hold the master encryption key, the database and the elevation binaries, so
     * an "everything" that silently excluded them would be a smaller grant than the words on
     * screen, and one that included them without saying would be a larger one. Both are the same
     * failure: the sentence beside the switch has to be the whole truth, because it is the only
     * thing the admin reads before agreeing.
     */
    warning: string;
    isOn: () => Promise<boolean>;
    set: (ctx: HelperSettingsContext, on: boolean) => Promise<HelperSettingsResult>;
  };
  /**
   * A switch on each member of the list, rather than on the capability as a whole.
   *
   * Exists because membership is not always the only decision. `host-services` (add-ons session,
   * 2026-07-26) approves a service and *then* asks whether a module may act on it without
   * prompting each time — a per-item boolean that fits neither `add` nor `remove`, and which
   * without this would have to live in a `SettingsPanel`. That would put half of what a
   * capability is allowed to do on a different screen from the other half, which is the exact
   * fragmentation CORE-10 exists to end.
   *
   * State is read from `ScopeItem.toggleOn`, not from a callback here — see the note there.
   * Core confirms before turning one ON (showing `warning`) and applies OFF immediately, the
   * same asymmetry as `unbounded`: widening asks, narrowing doesn't.
   */
  itemToggle?: {
    /** What the switch means, e.g. "Allow without asking". Shown against every item. */
    label: string;
    /**
     * Shown on the confirm step when switching one ON. As with `unbounded.warning`, name what
     * is actually given up — here, that the prompt which currently gates each action stops
     * appearing for this item.
     */
    warning?: string;
    set: (ctx: HelperSettingsContext, id: string, on: boolean) => Promise<HelperSettingsResult>;
  };

  /**
   * Core calls these through its own gated action — never a server action the helper defines.
   * Same reasoning as `onSettingsSubmit`: a check that must be remembered is eventually
   * forgotten, so the gated path is the only path.
   */
  add: (ctx: HelperSettingsContext, value: string) => Promise<HelperSettingsResult>;
  remove: (ctx: HelperSettingsContext, id: string) => Promise<HelperSettingsResult>;
};

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
   *
   * **Split read from write, always (owner rule, 2026-07-26): "ensure with all of it, there is a
   * read only and full options."** Any helper whose capability has a looking-at-it form and a
   * doing-something-to-it form declares both — `host-services:read` and `host-services:control`,
   * not one capability covering the pair. Most modules only ever need to look, and a single
   * capability forces the admin to grant the destructive half to get the harmless one, which
   * makes the switch on this page a choice between "useless" and "too much". `scope` is
   * per-capability, so the two get separate lists for free: a service approved read-only is
   * simply in the read scope and not the control one, with no flag to get wrong.
   *
   * Core cannot enforce the pairing — it never sees the verbs — so it is a contract obligation.
   */
  permission: DeclaredPermission;
  /**
   * The real-world effect, in plain language, shown to the admin — "Read and write files
   * in D:\Backups", not "filesystem access". A capability name tells nobody what could
   * happen to their machine. `describe` receives the helper's current configuration so
   * the sentence can name the actual directories in play.
   */
  describe: (config: Record<string, unknown>) => string;

  /**
   * Short label for Admin → Permissions — "Control Windows services". Falls back to the
   * permission key, which is precise and tells a person nothing.
   */
  label?: string;

  /**
   * How much damage this could do if misused, for ordering and emphasis on the Permissions
   * page. Judged by the helper, which knows what the capability reaches.
   *
   * `high` means "could compromise the machine or the install" — controlling services,
   * installing software, writing files. Do not reach for it to draw attention.
   */
  risk?: "low" | "medium" | "high";

  /**
   * The admin-owned set that bounds this capability, if it has one. Declared so core can render
   * and edit it on the same screen as the switch — see `HelperCapabilityScope`.
   *
   * Omit for a capability that is simply on or off.
   */
  scope?: HelperCapabilityScope;
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

  /**
   * Optional: the helper's own configuration, for `describe(config)` to render consent
   * wording that names real specifics — "Read and write files in D:\Backups" rather than
   * "the folders you allow" (MOD-10).
   *
   * Core cannot read this itself: a helper's config lives in its own `hlp_<id>_*` tables,
   * which core deliberately doesn't reach into. So the helper hands over just the part
   * consent needs, and nothing else.
   *
   * Called on admin screens only, best-effort and bounded. Throwing or hanging here must
   * never take a consent screen down — it falls back to generic wording, which is honest
   * rather than absent.
   */
  readConfig?: () => Promise<Record<string, unknown>>;

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

  /**
   * Runs ONCE, just before the helper's files are removed because no module needs it any more.
   *
   * **This exists for state a helper created OUTSIDE JonDash**, which nothing else can reach:
   * an OS-level grant, a scheduled task, a firewall rule, a registry key. Its own
   * `hlp_<id>_*` tables are deliberately left alone — removal is conservative, so reinstalling
   * the module brings the helper back with its history intact (see `pruneUnusedHelpers`).
   *
   * **The case that made this necessary** (OPS-18): `host-services` creates OS grants that
   * survive restarts and uninstalls. A module can clean up its own via `onUninstall`, but when
   * the *helper itself* was pruned there was no hook at all — so grants outlived the thing that
   * justified them, which is the one outcome the elevation design forbids. Owner, 2026-07-25:
   * *"when the module is removed, I don't want a random task present."*
   *
   * **Best-effort, and it must not block removal.** A helper that throws or hangs here cannot
   * be allowed to leave itself half-installed; the failure is logged and the files still go.
   * That means it is a tidy-up, not a guarantee — anything that MUST be revoked needs to be
   * revocable independently too, which for grants is `--remove --all` and Task Scheduler.
   */
  onUninstall?: (ctx: HelperBootContext, answers: Record<string, boolean>) => Promise<void>;

  /**
   * Questions for the uninstall confirmation screen; the replies arrive in `onUninstall`.
   * Same mechanism as a module's, and the same rules — except that a helper is **first-party**,
   * so `default: true` is honoured here and forced to false for modules.
   *
   * The case this was built for: `host-services` asking whether to withdraw the Windows
   * permissions it holds, and `host-install` asking whether to remove software JonDash
   * installed. Both need an answer from a person, and the person is only present here.
   *
   * Bounded and best-effort, like `readConfig`: a helper that throws or hangs shows the
   * uninstall without its questions rather than blocking it.
   */
  uninstallQuestions?: () => Promise<UninstallQuestion[]>;

  /**
   * A settings panel for this helper, rendered by CORE on Admin → Helpers.
   *
   * **Why this had to exist** (add-ons session, 2026-07-26). A helper whose safety rests on
   * admin-owned configuration had nowhere to be configured except through a consuming module —
   * so `host-services` exposed `admin.add` on its module-facing API, and a module could edit the
   * very allowlist that was supposed to bound it. It could display "Add Plex" and submit
   * "sshd"; the UAC prompt names the binary and never the service, so nothing on screen caught
   * the substitution. **The thing being bounded could edit its own boundary.**
   *
   * The fix is structural: admin-owned configuration is edited HERE, on a core page behind a
   * core permission check, with no module anywhere in the path.
   *
   * The panel is a client component. It must submit through `saveHelperSettingsAction` — see
   * `onSettingsSubmit` for why it may not define its own server action.
   */
  SettingsPanel?: ComponentType<{ ctx: HelperSettingsContext }>;

  /**
   * Receives what the panel submitted. Called ONLY by core's `saveHelperSettingsAction`, which
   * has already checked same-origin and the admin permission, and which builds `ctx` from the
   * real session.
   *
   * **A helper may not define its own server action for this.** It is first-party and could —
   * and that is precisely the point: the bug this whole feature exists to fix was a first-party
   * helper exposing something it should not have. Making the gated path the only path means the
   * check cannot be forgotten, rather than being remembered by every helper that ships.
   *
   * `ctx.user` is authoritative here in a way it was not before: core resolved it from the
   * session, so it is not something a caller supplied and it is not forgeable the way a
   * module-supplied context was.
   */
  onSettingsSubmit?: (
    ctx: HelperSettingsContext,
    payload: Record<string, unknown>,
  ) => Promise<HelperSettingsResult>;

  /**
   * Set when `onUninstall` may raise an **elevation prompt**. Its budget becomes the elevation
   * timeout (10 minutes) instead of the default 5 seconds.
   *
   * **Why this exists** — reported by the add-ons session, 2026-07-25, and they were right: the
   * 5s budget could never work for `host-services`. Revoking a grant needs elevation, elevation
   * waits on a human answering a UAC prompt, and core's own timeout for that is ten minutes. So
   * on any machine with live grants the hook was cut off mid-prompt, the files went anyway, and
   * the grants survived — the exact orphan the hook exists to close. It succeeded only in the
   * empty case, where there was nothing to do.
   *
   * **Blocking that long is acceptable here, and only here**, because `pruneUnusedHelpers` runs
   * inside the uninstall the admin has just clicked. They are at the machine, looking at the
   * screen, and the prompt they see has obvious provenance. That is the same reasoning the
   * elevation design uses throughout: creating or revoking a grant needs an interactive desktop;
   * using one does not.
   *
   * **Do not set this to buy a helper more time for ordinary work.** It exists for waiting on a
   * person, not for slow code. A helper that needs 30 seconds of computation should do it
   * elsewhere; this budget is a human's attention span, not a performance allowance.
   */
  uninstallMayPrompt?: boolean;
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
