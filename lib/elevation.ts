import "server-only";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { audit, auditOrThrow } from "@/lib/audit";

/**
 * Core-side API for `jondash-grant` (OPS-18) — the only supported way for a helper to create,
 * remove or list OS-level grants. A grant is one saved Windows Task Scheduler instruction with the
 * service name baked in when an admin approved it under UAC; it has no trigger and never fires by
 * itself, so JonDash can perform that one fixed action later with no prompt.
 *
 * ⚠ Pass STRUCTURED VALUES, never a command string. Nothing here takes arbitrary arguments, so a
 * fully compromised caller can only ask for verbs the binary implements. Keep it that way.
 * ⚠ A helper may spawn processes and so COULD invoke the binary itself. It must not: one place
 * resolves the path, one place audits (a caller that forgot would be invisible), and one place maps
 * exit codes, because "declined" and "failed" carry different retry policies.
 *
 * REFS tools/grant/Program.cs — the binary; its exit codes are mirrored below
 *      docs/ROADMAP.md § OPS-18 · JonDash-addons/helpers/ELEVATION.md — the helper-facing contract
 *      lib/audit.ts › auditOrThrow() — what makes the fail-closed path possible
 * PINS tests/unit/elevation.test.ts · tests/unit/audit.test.ts
 *
 * ⚠ Most exports here have NO caller inside core — helpers are their callers and live in the
 * add-ons repo, so a repo-wide search will wrongly read them as dead.
 */

/** The verbs a grant can express. Deliberately closed — this is a grammar, not a config. */
export type GrantVerb = "start" | "stop" | "restart";

/** REFS app/admin/permissions/actions.ts · app/admin/users/[id]/page.tsx — the admin surface */
export type Grant = {
  /** Task name inside `\JonDash\`, e.g. `Plex-restart`. */
  name: string;
  enabled: boolean;
  /** The exact fixed command the task runs. Show this to admins verbatim. */
  command: string;
  description: string;
};

/**
 * Why a call didn't do what was asked. ⚠ Callers must distinguish these — especially `declined`,
 * which is a person exercising a choice rather than anything going wrong.
 */
export type GrantFailure =
  | "unsupported-platform" // not Windows
  | "not-installed" // the binary is missing from this install
  | "declined" // the admin dismissed the UAC prompt
  | "timed-out" // the prompt was never answered
  | "no-interactive-desktop" // Session 0 / container / headless — cannot prompt
  | "invalid-request" // rejected by the binary's own grammar
  | "not-audited" // refused because the attempt could not be recorded
  | "package-not-found" // no such package in the source
  | "no-package-manager" // winget isn't present on this machine
  | "failed"; // everything else

export type GrantResult<T> = { ok: true; value: T } | { ok: false; reason: GrantFailure; message: string };

/**
 * Exit codes, mirrored from the binary.
 *
 * ⚠ The LITERAL's shape is parsed out of this file by a regex in the test below — keep it a single
 * flat object literal, or the check that the two copies agree silently stops checking.
 * REFS tools/grant/Program.cs — the other copy
 * PINS tests/unit/elevation.test.ts — fails when they diverge
 */
const EXIT = { ok: 0, usage: 2, failed: 3, noDesktop: 4, declined: 1223 } as const;

/**
 * ⚠ Must be generous: a `--create` sits at a UAC prompt until a human decides, and someone weighing
 * up whether to grant admin rights can easily take minutes. At 2 minutes they were told the
 * operation broke. A timeout is its own outcome — see `run()` for why it needs detecting.
 */
const TIMEOUT_MS = 600_000;

/**
 * ⚠ Resolved here and nowhere else. The binary ships inside the release archive at
 * `bin/jondash-grant.exe`, next to the app rather than anywhere the user configures — a caller
 * that computes its own path is a caller that can be made to compute a different one.
 */
export function grantBinaryPath(): string {
  return path.join(process.cwd(), "bin", "jondash-grant.exe");
}

/** Whether grants are usable at all on this machine. Cheap; safe to call on a render path. */
export function grantSupport(): { available: true } | { available: false; reason: GrantFailure; message: string } {
  if (process.platform !== "win32") {
    return {
      available: false,
      reason: "unsupported-platform",
      // Stated plainly: the Linux design exists (OPS-18) but is unbuilt, because there is no
      // Linux launcher yet (OPS-19).
      message: "Service grants are Windows-only in this release.",
    };
  }
  if (!fs.existsSync(grantBinaryPath())) {
    return {
      available: false,
      reason: "not-installed",
      message: "jondash-grant.exe is missing from this install (expected at bin\\jondash-grant.exe).",
    };
  }
  return { available: true };
}

type RunOutcome = { code: number; stdout: string; stderr: string; timedOut: boolean };

function run(args: string[]): Promise<RunOutcome> {
  return new Promise((resolve) => {
    // ⚠ `execFile`, NEVER a shell. Arguments go as an argv array, so nothing in a service name
    // can be reinterpreted as shell syntax; `shell: true` would undo the whole grammar argument.
    execFile(grantBinaryPath(), args, { timeout: TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      // ⚠ Node reports a timeout by KILLING the child, leaving no exit code — detect it separately
      // or a slow UAC prompt silently becomes "failed".
      const killed = Boolean(err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed);
      const numeric = err && typeof (err as { code?: unknown }).code === "number"
        ? (err as unknown as { code: number }).code
        : null;
      const code = numeric !== null ? numeric : err ? EXIT.failed : EXIT.ok;
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), timedOut: killed });
    });
  });
}

function classify(o: RunOutcome): GrantFailure {
  if (o.timedOut) return "timed-out";
  if (o.code === EXIT.declined) return "declined";
  if (o.code === EXIT.noDesktop) return "no-interactive-desktop";
  if (o.code === EXIT.usage) return "invalid-request";
  return "failed";
}

/** The binary's own message is the useful one; fall back rather than invent wording. */
function messageFrom(o: RunOutcome, fallback: string): string {
  const s = o.stderr.trim() || o.stdout.trim();
  return s.length > 0 ? s.split("\n")[0]!.replace(/^error:\s*/, "") : fallback;
}

/**
 * Run the binary and record it. `mustAudit` encodes a deliberate ASYMMETRY and the direction is
 * the whole point:
 *
 * ⚠ GRANTING privilege fails closed — the intent is written before the action, and if that write
 * fails the action does not happen. "Audited" and "attempted to audit" are different promises.
 * ⚠ REVOKING privilege proceeds regardless. An unrecorded revocation is a gap in the record; an
 * unrevoked grant is a live capability nobody wanted.
 * REFS lib/audit.ts › auditOrThrow() — throws where `audit()` swallows, which is what makes the
 *      fail-closed direction possible
 */
async function invoke<T>(
  args: string[],
  auditAction: string,
  auditDetail: string,
  /**
   * ⚠ For anything that ELEVATES there is no stdout — the elevated child owns its own console — so
   * those callers must read the result back from Windows instead of parsing here.
   */
  parse: (o: RunOutcome) => T,
  opts: { userId?: string | null; mustAudit?: boolean } = {},
): Promise<GrantResult<T>> {
  const support = grantSupport();
  if (!support.available) return { ok: false, reason: support.reason, message: support.message };

  if (opts.mustAudit) {
    try {
      await auditOrThrow(`${auditAction}.attempt`, { userId: opts.userId ?? undefined, detail: auditDetail });
    } catch {
      return {
        ok: false,
        reason: "not-audited",
        message:
          "Refusing to grant a privilege that cannot be recorded — the audit log is unavailable. " +
          "Nothing was changed.",
      };
    }
  }

  const outcome = await run(args);

  /*
   * ⚠ The OUTCOME audit is always best-effort: the action has already happened, so throwing here
   * would report a failure that did not occur.
   * ⚠ Record it whatever it was, including declined and failed — a log holding only successes
   * cannot answer "did anyone try?", which is the question that matters after an incident.
   */
  await audit(auditAction, {
    userId: opts.userId ?? undefined,
    detail: `${auditDetail} → exit ${outcome.code}${outcome.code === EXIT.ok ? "" : ` (${classify(outcome)})`}`,
  });

  if (outcome.code !== EXIT.ok) {
    return { ok: false, reason: classify(outcome), message: messageFrom(outcome, "The grant command failed.") };
  }
  return { ok: true, value: parse(outcome) };
}

/**
 * Create the grants for one entry. ⚠ All verbs go in ONE call on purpose — that is a single UAC
 * prompt for the decision actually being made, rather than three carrying no extra information,
 * which only teaches the admin to click through.
 *
 * Needs an interactive desktop; `runGrant()` below does not, and that asymmetry is what makes
 * unattended automation possible. REFS tools/grant/Program.cs — `--create` re-launches elevated
 */
export async function createGrant(input: {
  service: string;
  verbs: GrantVerb[];
  /** Optional name for the task; defaults to the service name. Sanitised by the binary. */
  id?: string;
  /** The Windows account JonDash runs as, which will be allowed to RUN the task (not edit it). */
  account?: string;
  /**
   * Who approved it, recorded in the task's Description so Task Scheduler reads as an audit trail.
   */
  by?: string;
  /** Self-delete after a single run. Cannot serve unattended automation — see OPS-18. */
  once?: boolean;
  userId?: string | null;
}): Promise<GrantResult<string[]>> {
  if (input.verbs.length === 0) {
    return { ok: false, reason: "invalid-request", message: "At least one verb is required." };
  }
  const args = ["--create", "--service", input.service, "--verb", input.verbs.join(",")];
  if (input.id) args.push("--id", input.id);
  if (input.account) args.push("--account", input.account);
  if (input.by) args.push("--by", input.by);
  if (input.once) args.push("--once");

  const created = await invoke(
    args,
    "elevation.grant.create",
    `${input.service} [${input.verbs.join(",")}]${input.once ? " once" : ""}`,
    /*
     * ⚠ Deliberately NOT the child's stdout: `--create` re-launches itself elevated and that
     * process writes to its own hidden console, so nothing comes back.
     * ⚠ DO NOT "fix" this by passing the elevated child a path to write results to. We choose that
     * path while unprivileged, so it is an arbitrary file write AS ADMINISTRATOR — exactly the
     * shape this design refuses. The names are read back from Windows below instead.
     */
    () => undefined,
    // Granting is the direction that fails closed — see `invoke` for why revoking is not.
    { userId: input.userId, mustAudit: true },
  );
  if (!created.ok) return created;

  // Read the truth from the OS rather than deriving it. Needs no elevation and no prompt, and
  // survives the binary changing how it sanitises a name. REFS previewGrantName() below
  const listed = await listGrants();
  if (!listed.ok) return listed;
  const prefix = ((input.id ?? input.service).match(/[A-Za-z0-9._-]+/g) ?? []).join("");
  const names = listed.value
    .map((g) => g.name)
    .filter((n) => input.verbs.some((v) => n.toLowerCase() === `${prefix}-${v}`.toLowerCase()));
  return { ok: true, value: names };
}

/**
 * Trigger an existing grant — the moment a service actually starts, stops or restarts.
 *
 * ⚠ Helpers must call this rather than spawning `schtasks /run` themselves. Running cannot
 * escalate, so it bends no rule, but it puts the event outside core's audit trail — and `use` was
 * the one privileged event the log was missing.
 * ⚠ Needs NO elevation, and nothing here can create a capability: if the grant does not exist this
 * simply fails. That is what lets a health check restart a hung service at 3am.
 * Returns once the task has STARTED — a service stop can take seconds, so poll it if that matters.
 * PINS tests/unit/elevation.test.ts — helpers are the real callers, from the add-ons repo
 */
export async function runGrant(input: { name: string; userId?: string | null }): Promise<GrantResult<string>> {
  if (!input.name.trim()) {
    return { ok: false, reason: "invalid-request", message: "A grant name is required." };
  }
  return invoke(
    ["--run", "--id", input.name],
    "elevation.grant.run",
    input.name,
    (o) => o.stdout.trim(),
    // Best-effort audit on purpose: this USES a capability an admin already approved, and
    // refusing to restart a hung service because the log is down would break the automation.
    { userId: input.userId },
  );
}

/** Remove the grants for one entry. Idempotent — removing what isn't there succeeds. */
export async function removeGrant(input: {
  service?: string;
  id?: string;
  userId?: string | null;
}): Promise<GrantResult<string[]>> {
  if (!input.service && !input.id) {
    return { ok: false, reason: "invalid-request", message: "A service or id is required." };
  }
  const args = ["--remove"];
  if (input.id) args.push("--id", input.id);
  else args.push("--service", input.service!);

  return invoke(
    args,
    "elevation.grant.remove",
    input.id ?? input.service!,
    (o) => o.stdout.split("\n").map((l) => l.trim()).filter(Boolean),
    { userId: input.userId },
  );
}

/**
 * Remove EVERY grant and the `\JonDash\` folder — the uninstall path. ⚠ Nothing elevated may
 * outlive the thing that justified it.
 *
 * ⚠ It needs elevation, so it cannot be silent. On a decline the caller must say plainly that
 * grants remain and how to remove them by hand; reporting a clean uninstall leaves an elevated
 * task nobody knows about. REFS lib/audit.ts — the only core caller
 */
export async function removeAllGrants(opts: { userId?: string | null } = {}): Promise<GrantResult<string[]>> {
  return invoke(
    ["--remove", "--all"],
    "elevation.grant.remove-all",
    "all grants",
    (o) => o.stdout.split("\n").map((l) => l.trim()).filter(Boolean),
    opts,
  );
}

/**
 * What is actually granted, read from Windows rather than from any record of ours — so it cannot
 * drift, and an orphan left by a skipped uninstall still shows up.
 *
 * ⚠ No elevation and no audit entry: reading is not a privileged act, and a UAC prompt merely to
 * answer "what may JonDash do?" would train people to click through.
 * REFS createGrant() above — reads the created names back through this
 * PINS tests/unit/elevation.test.ts
 */
export async function listGrants(): Promise<GrantResult<Grant[]>> {
  const support = grantSupport();
  if (!support.available) return { ok: false, reason: support.reason, message: support.message };

  const outcome = await run(["--list", "--json"]);
  if (outcome.code !== EXIT.ok) {
    return { ok: false, reason: classify(outcome), message: messageFrom(outcome, "Could not read grants.") };
  }
  try {
    const parsed = JSON.parse(outcome.stdout.trim() || "[]") as Grant[];
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, reason: "failed", message: "Could not parse the grant list." };
  }
}

/*
 * ─── Package actions (the elevate shim) ─────────────────────────────────────────────────────
 *
 * ⚠ WEAKER THAN GRANTS, unavoidably. A grant is safe because the action is frozen when the admin
 * approves it; an install has a variable part, so nothing can be frozen and every one prompts.
 * ⚠ UAC does not protect the admin here — the prompt names `jondash-elevate.exe` and says nothing
 * about the package. THE CALLER'S OWN SCREEN IS THE CONSENT SURFACE and must show the package id
 * verbatim. All the shim contributes is a bound: install or uninstall a named package from the
 * official winget source, and nothing beyond that catalogue.
 * ⚠ Residual risk, accepted: an installer runs the vendor's code as administrator by definition.
 * REFS tools/elevate/Program.cs — the shim itself
 */

export type PackageManager = "winget";
export type PackageState = "installed" | "not-installed";

const PKG_EXIT = { ok: 0, usage: 2, failed: 3, noDesktop: 4, notFound: 5, already: 6, noManager: 7, declined: 1223 } as const;

function elevateBinaryPath(): string {
  return path.join(process.cwd(), "bin", "jondash-elevate.exe");
}

function runShim(args: string[]): Promise<RunOutcome> {
  return new Promise((resolve) => {
    execFile(elevateBinaryPath(), args, { timeout: TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      const killed = Boolean(err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed);
      const numeric = err && typeof (err as { code?: unknown }).code === "number"
        ? (err as unknown as { code: number }).code
        : null;
      resolve({
        code: numeric !== null ? numeric : err ? PKG_EXIT.failed : PKG_EXIT.ok,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
        timedOut: killed,
      });
    });
  });
}

function classifyPkg(o: RunOutcome): GrantFailure {
  if (o.timedOut) return "timed-out";
  if (o.code === PKG_EXIT.declined) return "declined";
  if (o.code === PKG_EXIT.noDesktop) return "no-interactive-desktop";
  if (o.code === PKG_EXIT.usage) return "invalid-request";
  if (o.code === PKG_EXIT.notFound) return "package-not-found";
  if (o.code === PKG_EXIT.noManager) return "no-package-manager";
  return "failed";
}

/** Whether package actions are possible here. Cheap; no prompt. */
export function packageSupport(): { available: true } | { available: false; reason: GrantFailure; message: string } {
  if (process.platform !== "win32") {
    return { available: false, reason: "unsupported-platform", message: "Package actions are Windows-only in this release." };
  }
  if (!fs.existsSync(elevateBinaryPath())) {
    return { available: false, reason: "not-installed", message: "jondash-elevate.exe is missing from this install." };
  }
  return { available: true };
}

async function pkgAction(
  action: "install" | "uninstall",
  pkg: string,
  opts: { manager?: PackageManager; userId?: string | null } = {},
): Promise<GrantResult<"done" | "already">> {
  const support = packageSupport();
  if (!support.available) return { ok: false, reason: support.reason, message: support.message };

  // ⚠ Audited BEFORE acting, like createGrant — this elevates, and an elevated action with no
  // record is the outcome the log exists to prevent.
  try {
    await auditOrThrow(`elevation.package.${action}.attempt`, { userId: opts.userId ?? undefined, detail: pkg });
  } catch {
    return {
      ok: false,
      reason: "not-audited",
      message: "Refusing to run an elevated install that cannot be recorded — the audit log is unavailable.",
    };
  }

  const outcome = await runShim(["--action", action, "--manager", opts.manager ?? "winget", "--package", pkg]);
  await audit(`elevation.package.${action}`, {
    userId: opts.userId ?? undefined,
    detail: `${pkg} → exit ${outcome.code}${outcome.code === PKG_EXIT.ok ? "" : ` (${classifyPkg(outcome)})`}`,
  });

  if (outcome.code === PKG_EXIT.ok) return { ok: true, value: "done" };
  // "Already in that state" is a success for the caller's purpose, but they may want to word it
  // as "already installed" rather than "installed".
  if (outcome.code === PKG_EXIT.already) return { ok: true, value: "already" };
  return { ok: false, reason: classifyPkg(outcome), message: messageFrom(outcome, `The ${action} failed.`) };
}

/**
 * Install a package. ⚠ Prompts for elevation EVERY time — there is nothing to grant once.
 *
 * Returns when the installer has FINISHED, which can be minutes, and there is no progress stream:
 * the elevated child owns its console, the same constraint that shapes `createGrant`. Poll
 * `packageState()` for progress — it needs no elevation and never prompts.
 */
export function installPackage(
  pkg: string,
  opts: { manager?: PackageManager; userId?: string | null } = {},
): Promise<GrantResult<"done" | "already">> {
  return pkgAction("install", pkg, opts);
}

/**
 * Uninstall a package. Prompts every time. ⚠ Only ever call it for something JonDash installed —
 * clean up what you created, never what you found.
 */
export function uninstallPackage(
  pkg: string,
  opts: { manager?: PackageManager; userId?: string | null } = {},
): Promise<GrantResult<"done" | "already">> {
  return pkgAction("uninstall", pkg, opts);
}

/**
 * Whether a package is installed. No elevation, no prompt, no audit entry — reading is not a
 * privileged act, and a prompt per poll would make progress-checking unusable.
 */
export async function packageState(
  pkg: string,
  opts: { manager?: PackageManager } = {},
): Promise<GrantResult<PackageState>> {
  const support = packageSupport();
  if (!support.available) return { ok: false, reason: support.reason, message: support.message };

  const outcome = await runShim(["--action", "status", "--manager", opts.manager ?? "winget", "--package", pkg]);
  if (outcome.code !== PKG_EXIT.ok) {
    return { ok: false, reason: classifyPkg(outcome), message: messageFrom(outcome, "Could not check the package.") };
  }
  return { ok: true, value: outcome.stdout.trim() === "installed" ? "installed" : "not-installed" };
}

/**
 * What a name will become once sanitised. ⚠ AUTHORITATIVE, not advisory — a caller that sanitises
 * locally and assumes agreement gets it wrong. A helper mapping a space to `-` where this deletes
 * it saw `My Service` and `MyService` as two entries and Windows saw ONE task: their collision
 * check passed, and removing either silently revoked the other.
 *
 * ⚠ Any caller deciding whether two entries collide must ask here rather than guess.
 * REFS createGrant() above — reads names back from Windows for the same reason
 */
export async function previewGrantName(name: string): Promise<GrantResult<string>> {
  const support = grantSupport();
  if (!support.available) return { ok: false, reason: support.reason, message: support.message };
  const outcome = await run(["--check-name", name]);
  if (outcome.code !== EXIT.ok) {
    return { ok: false, reason: classify(outcome), message: messageFrom(outcome, "Could not check the name.") };
  }
  return { ok: true, value: outcome.stdout.trim() };
}
