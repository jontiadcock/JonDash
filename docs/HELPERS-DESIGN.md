# Helpers — design (MOD-08)

> Status: **in progress**, targeting 1.5.0. This is the design of record; where it and the code disagree,
> the code wins and this is a bug.

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
