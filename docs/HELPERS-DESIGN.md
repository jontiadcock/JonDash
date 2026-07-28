# Helpers — design (MOD-08)

> Status: **shipped in 1.5.0** (`scheduler` is the first helper); **helper-named capabilities + the consent
> roll-up in 1.5.1**. This is the design of record; where it and the code disagree, the code wins and this
> is a bug.
>
> **1.5.2 gave helpers an update path and a channel.** A helper could previously only change version as a
> side effect of a module install, so a published fix reached nobody unless a module happened to update
> too — and a shared helper's version flip-flopped with whichever module was touched last. Helpers now
> have their own section on Admin → Updates, a channel **derived** from the highest among their dependents
> (with an optional admin pin), and a compatibility contract: a module may state
> `helpers: [{ id, minVersion }]`, a helper may declare `breakingFrom`, and an update that would break a
> dependent names it and refuses until confirmed. **Rule 5's "never breaks its API" is still a promise
> with nothing enforcing it** — the missing piece is a publish-time diff of `api.ts`'s exported surface,
> which belongs in the add-ons publish gate.
>
> **1.5.1 closed the gap that made rule 4 unenforceable.** A helper could *provide* a capability but not
> *name* one: `provides` was filtered against the four core permissions, so anything else was silently
> dropped and never reached a consent screen. A capability is now `{id, label}` with `id` namespaced to the
> helper (`filesystem:write`), the helper supplies the wording, and an unrecognised entry **refuses the
> helper** instead of being discarded. Consent lists every capability of every helper a module declares —
> whether or not the module named it — because declaring the helper is what grants access.
>
> Related: [module authoring](MODULES-AUTHORING.md) · [the official source](https://github.com/jontiadcock/JonDash-addons) · [README](../README.md)

## Why

Modules are deliberately forbidden the filesystem, process spawning and raw sockets — that ban is the only
thing that makes the permission list mean anything. But it also makes an entire class of module
**impossible**: a backup module, a file-sync module, anything that touches the machine. No amount of core
API fixes that, because "let modules write files" is not something you would ever put in core.

A **helper** is first-party code, published like a module, that does the privileged work on a module's
behalf through a narrow, purpose-built API. The trust argument is simple and load-bearing: **helpers can
only be authored by JonDash**, so a helper is the same trust domain as the app itself. That single
restriction is what makes privileged capability safe to delegate — and it is why it can never be relaxed.

Secondary benefit: capability stops accreting into core on the core release cadence. `ctx.net.ping` had to
go into core because a module can't spawn `ping`; under this model it would be a helper.

## The rules

1. **First-party only, enforced in code.** Helpers are listed in a separate `helpers` array in
   `addons.json` and are installable **only from the official source**. The installer refuses a helper
   offered by any other source. If this is convention rather than code, a third party publishes a
   `helpers/` folder and inherits the privilege.
2. **Narrow APIs, never a general escape hatch.** `copyFile(from, to)` and `listDirectory(path)` are
   reviewable; `run(command)` is a backdoor that makes the verifier ceremonial — every ban on modules
   becomes one helper call away, and modules regain arbitrary execution by proxy. When a consumer needs
   something the API doesn't cover, the answer is **a new narrow call, not a general one**. This will be
   tempting exactly once, and that is the moment to refuse it.
3. **Roots are configured by the admin, not chosen by the module.** For anything touching the filesystem
   the admin declares which directories are in play; the helper refuses paths outside them and refuses
   traversal out of them. A module naming its own path is the same hole in a different shape.
4. **Consent states the real-world effect.** "Read and write files in `D:\Backups`", not "filesystem
   access". Roll-up only means something if the sentence tells someone what could happen to their machine.
5. **One version, always current, backward-compatible.** Both sides are ours, so we simply guarantee it —
   no resolution, no conflicts, no version negotiation.
6. **Auto-install, conservative removal.** Installing a module installs the helpers it needs, shown as one
   visible batch with every permission involved. Removal never destroys helper-owned data.
7. **Anything elevated goes through core, and is audited.** A helper may spawn processes, so it *could*
   invoke `bin/jondash-grant.exe` itself. **It must not.** Elevation is reached only through
   `lib/elevation.ts` (OPS-18) — `createGrant`, `removeGrant`, `removeAllGrants`, `listGrants`.
   **Owner requirement, 2026-07-25: *"I want it to be audited."***

   Three things break the moment a helper goes direct, and all three break *quietly*:
   - **The audit trail.** Core logs every call — including **declined** and **failed**, because a log
     that only records successes cannot answer "did anyone try?", which is the question that matters
     after an incident. A helper spawning the binary itself simply wouldn't appear, and the one that
     forgot would be the invisible one.
   - **Path resolution.** One place resolves `bin/jondash-grant.exe`. A helper that *computes* the path
     is a helper that can be made to compute a different one.
   - **Exit-code meaning.** `declined` (1223) and `failed` are different outcomes with different retry
     policies. Conflating them tells somebody an operation broke when they simply said no.

   This is rule 2 in another shape: the narrow API is the point, and reaching around it returns the
   general escape hatch that rule exists to prevent.
8. **A helper's module-facing API must contain NO mutators for admin-owned configuration.**
   Read and request, never add, remove or approve. Admin-owned config is edited on a **core**
   screen behind a core permission check, with no module in the path. Since CORE-10 there are two
   such screens, and **they are different pages** — the add-ons session got this wrong in three
   user-facing strings before loading the page, so it is spelled out here:

   | What | Where it renders | Declared as |
   | ---- | ---------------- | ----------- |
   | The set that **bounds a capability** — which services, which folders | **Admin → Permissions**, on the same card as that capability's on/off switch | `scope` on the `HelperCapability` |
   | **Everything else** a helper needs configured | **Admin → Addons → Shared capabilities**, under that helper | `SettingsPanel` + `onSettingsSubmit` on the `HelperDefinition` |

   Admin → Permissions is organised **per (module, capability)**, so a helper-wide setting has no
   row to live on there. A helper's own panel belongs with the helper, which is the Shared
   capabilities section of the Addons page (`app/admin/modules/shared-capabilities.tsx`).

   **This is the rule that was missing, and the bug is the argument for it** (found by the owner,
   2026-07-26). `host-services` exposed `admin.add` on the surface a module could reach, because
   there was nowhere else to put an allowlist editor. The consuming module's consent screen said
   *"start, stop and restart the services you listed"* — nothing about **adding** to that list —
   and `admin.add` took the service name from the module's own form. So a module could display
   **"Add Plex" and submit "sshd"**. The UAC prompt names `jondash-grant.exe` and never the
   service, so nothing on screen caught the substitution.

   **The allowlist is meant to BE the boundary, and the thing it bounds could edit it.**

   Both apparent mitigations were weaker than they read: `ctx.user` is forgeable exactly as
   `ctx.can` is, and UAC is unforgeable but *content-free* — it proves a human was present, not
   what they agreed to.

   **It generalises.** Any helper whose safety rests on admin-owned configuration has this shape
   the moment the only place to edit that configuration is a module. `filesystem` has it today:
   backup-manager's panel manages the approved roots. Less dangerous — a root is a folder, not a
   standing OS permission — but the same structure, and worth moving.

9. **Every capability with a read form and a write form declares both.** Owner rule, 2026-07-26:
   *"ensure with all of it, there is a read only and full options."* `host-services:read` and
   `host-services:control`, never one capability spanning the pair. Most modules only ever need to
   look, and a combined capability forces the admin to grant the destructive half to obtain the
   harmless one — which makes the switch on Admin → Permissions a choice between useless and too
   much, and pushes people toward granting more than they meant to.

   `scope` is per-capability, so the split costs nothing: a service approved read-only is simply in
   the read scope and not the control one, with no flag to get wrong, and `mayPrompt` can be true
   for one and false for the other. Core never sees the verbs, so it cannot enforce this — it is a
   contract obligation on the helper author.

10. **Where "allow everything" would reach JonDash's own data, that is a CHOICE the admin makes —
    never a silent carve-out and never a silent inclusion.** Owner decision, 2026-07-26, refined
    after the add-ons session put the filesystem case up.

    `.data/`, `prisma/` and `bin/` hold the master encryption key, the database and the elevation
    binaries. Core's first proposal was a fixed carve-out; the owner overruled it, because an
    "everything" that quietly excluded them grants *less* than the words on screen. The final
    shape, which is better than either option core put up: turning "everything" on reveals a
    second switch — **"exclude JonDash's own data", defaulting to protected**. The sentence beside
    the switch can then be true in **both** states.

    Declared as `unbounded.option` (`lib/helpers/types.ts`). **The confirm asymmetry inverts for
    it**: everywhere else ON widens and therefore asks, but the option protects, so switching it
    OFF is the widening step and the one core confirms.

11. **Every optional field in the contract is optional to OMIT, never optional to ADD.** Measured
    by the add-ons session against a 1.7.1 clone, 2026-07-26, after core's own hand-off note said
    "the new fields are optional" without this caveat.

    A helper that leaves `label`/`risk`/`scope` off runs on any core that has the rest of the
    contract. A helper that *declares* one does not merely look plainer on an older core — helpers
    **compile into the app**, so an unknown property is `TS2353` and a missing type is `TS2724`:
    a failed build and an install that will not start.

    So adopting a contract addition is a hard `minAppVersion` bump, **and it propagates** — every
    consuming module needs the same floor, or it installs on an older core, pulls the helper in,
    and takes the build down with it. Floors so far: `label`/`risk`/`scope`/`browse`/`unbounded`/
    `itemToggle` → `1.7.2-beta.1`; `unbounded.option` → `1.7.2-beta.2`.

12. **A helper only STARTS when an enabled module needs it — and the schema is kept current either
    way.** Two separate decisions in `bootHelpers()`, and conflating them breaks one or the other.

    `onBoot` runs only for a helper some **enabled** module depends on. Migrations run for every
    **installed** helper, enabled or not, because a disabled module can be re-enabled at any moment
    and its helper must never meet a layout it wasn't written against.

    **Why this needed stating** (add-ons session, 2026-07-27): for almost every helper the
    distinction is invisible, since a helper does nothing until a module calls it — a disabled
    module means a dormant helper by definition. It stops being invisible the moment a helper
    **holds a resource of its own**: a listening socket, a file watcher, a timer with side effects.
    The `mcp` helper was the first, and switching its add-on off left the endpoint open with nothing
    on screen saying so. The admin had done nothing, and believed they had closed the door.

    **If your helper holds anything, this is your rule.** Core now refuses to start you, which is
    the safe direction — it can only ever leave a resource unopened, never open one that the add-on
    switch would have closed. You should still fail closed yourself rather than assume core got
    there first.

13. **A helper may ask the admin a question on uninstall — a module may too, under tighter rules.**
   `uninstallQuestions()` puts yes/no questions on the confirmation screen and the answers arrive in
   `onUninstall`. It exists because that hook is headless and runs *after* the admin has confirmed,
   so anything needing a decision — *"also remove Docker Desktop?"*, *"withdraw the Windows
   permissions this holds?"* — had nowhere to be asked. Doing either automatically is wrong (it is
   the admin's machine); doing neither silently is also wrong.

   **The risk is that a MODULE is third-party code putting text on a core admin screen**, so core
   constrains it and the constraints live in `lib/uninstall-questions.ts`, not in the callers:
   every question is **attributed** to whoever asked; label and detail render as **text, never
   markup**; **a module's `default: true` is forced to false** (a third party does not pre-tick a
   box on a destructive screen — helpers, being first-party, keep theirs); **ten questions maximum**;
   and the call is **bounded and best-effort**, so a module that throws or hangs shows the uninstall
   *without* its questions rather than making itself unremovable.

   A "yes" grants nothing new — it is a prompt to use something the admin already consented to at
   install.

## Shape

**Declaration.** A module names the helpers it needs; the manifest entry must match the code exactly, the
same rule permissions follow:

```ts
// modules/<id>/module.ts
const mod: ModuleDefinition = {
  helpers: ["scheduler"],
  permissions: ["files:write"],   // only allowed if a declared helper provides it
};
```

**Consumption is a declared entry point, not free imports** into a helper's folder — otherwise a helper
can't refactor its internals without breaking consumers, which is the problem the two-import rule solves at
the core level, recreated one layer down:

```ts
import { schedule } from "@/helpers/scheduler/api";
```

The verifier allows `@/helpers/<id>/api` **only for helper ids the module declared**.

**Permissions.** A helper declares what it `provides`. A module may declare a helper-provided permission
only if it also declares that helper. The consent screen shows the helper's plain-language sentence. This
is how privileged capability reaches a module without the module itself being trusted: the helper does the
work, the admin approved the effect, and the module never touches the primitive.

**Boot.** Helpers run at server start via Next's `instrumentation.ts` `register()`, which runs **once per
server instance and must complete before requests are served** (verified against the Next 16 docs). This is
what makes a scheduler actually reliable: restart at 03:00 and the schedule runs, whether or not anyone
opens a page. Two constraints follow from "must complete before serving":

- **Boot registers intent; it must not do work.** A helper starts a timer and returns. Anything slow
  happens on the first tick.
- **A helper throwing at boot must never stop the server.** Each helper's boot is isolated; a failure is
  logged and surfaced, not fatal. A monitoring helper must not be the reason the dashboard won't start.

**Admin surface.** A read-only **Helpers** page: each installed helper, its version, and which modules
depend on it — so "why is this here?" has an answer. No install, import or remove controls.

## Helper data in backups (JonDash 1.8.0+, OPS-16)

A helper declares its own tables the same way a module does, on `HelperDefinition`:

```ts
backup: { tables: [{ name: "keys", secret: ["token"] }, { name: "settings" }] },
```

Names are logical and un-prefixed; core resolves them through `helperTableName()`. Undeclared means
not exported. `secret` columns are kept in an **encrypted** backup and blanked out of an unencrypted
one — the same rule core applies to its own secret settings, and one a helper author has no way to
discover from their side.

Restored **only into the same helper version**, with anything else skipped and reported. Rule 11's
reasoning applies: a helper's tables belong to the helper, and core writing a different version's
rows into them would be core corrupting data it deliberately does not otherwise read.

**Why helpers are in scope at all**, when they have no `Module` row and no dashboard presence: the
add-ons session raised it and the owner scoped it in on 2026-07-27. The MCP helper keeps its keys and
settings in `hlp_mcp_*`, so a backup that took every module's data and ignored the helper holding the
credentials would restore an install that looked complete and could not talk to anything.

## Where helper code lives

Helpers live in the **official addons repository** (`helpers/<id>/`) and are installed from it, exactly
like a module — not shipped inside the app. That keeps new capability on the addons cadence rather than the
core release cadence, which is the point of the mechanism.

The safety argument rests entirely on **official-source-only**, enforced in code: `fetchSourceManifest`
discards a `helpers` array from any other source, so publishing one cannot inherit the privilege. Helper
code is deliberately NOT run through the module verifier — its bans are the things a helper exists to do —
but archive hygiene (traversal, file types, size caps) still applies.

Helpers arrive **with the module that declares them**, in the same batch and the same restart, and are
removed when nothing depends on them any more — **files only, never their data**.

## Build order

1. **Framework** + **scheduler helper** — the scheduler proves boot-time execution and helper-owned data
   surviving its last dependent being removed, and it has a real consumer waiting (health-monitor's poller,
   which today only starts when someone renders a page).
2. **Filesystem helper** — proves the privilege model and consent roll-up under the sharpest case. Needs
   admin-configured roots, which is its own chunk of UI.

The consumer module for (2) must be chosen for what it genuinely is **before** the helper API is designed.
Design the API first and build a module to fit it, and the test proves only that the helper matches itself.
