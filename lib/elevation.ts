import "server-only";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { audit } from "@/lib/audit";

/**
 * Core-side API for `jondash-grant` (OPS-18) — the only supported way for a helper to create,
 * remove or list OS-level grants.
 *
 * A grant is one saved instruction in Windows Task Scheduler: "stop then start the Plex
 * service", with the service name baked in when an admin approved it under UAC. It has no
 * trigger and never fires by itself; it exists so JonDash can perform that one fixed action
 * later without an admin prompt. See docs/ROADMAP.md § OPS-18 and
 * JonDash-addons/helpers/ELEVATION.md.
 *
 * WHY HELPERS GO THROUGH HERE RATHER THAN SPAWNING IT THEMSELVES
 * Helpers are allowed to spawn processes, so a helper *could* invoke the binary directly. It
 * must not, and this module exists so it doesn't have to:
 *  - **One place resolves the path.** A helper hardcoding it would break on the next install
 *    layout change, and a helper *computing* it is a helper that can be made to compute a
 *    different one.
 *  - **One place audits.** Every elevated action must be logged (ELEVATION.md rule 7). If each
 *    caller did its own, the one that forgot would be invisible — which is the case that matters.
 *  - **One place maps exit codes.** "The admin declined" and "the action failed" mean different
 *    things and carry different retry policies; conflating them is how a UI ends up telling
 *    somebody an operation broke when they simply said no.
 *
 * THIS MODULE PASSES STRUCTURED VALUES, NEVER A COMMAND STRING. There is deliberately no
 * function here that takes arbitrary arguments, because a fully compromised caller must only
 * be able to ask for verbs the binary implements.
 */

/** The verbs a grant can express. Deliberately closed — this is a grammar, not a config. */
export type GrantVerb = "start" | "stop" | "restart";

export type Grant = {
  /** Task name inside `\JonDash\`, e.g. `Plex-restart`. */
  name: string;
  enabled: boolean;
  /** The exact fixed command the task runs. Show this to admins verbatim. */
  command: string;
  description: string;
};

/**
 * Why a call didn't do what was asked. Callers must distinguish these — particularly
 * `declined`, which is a person exercising a choice rather than anything going wrong.
 */
export type GrantFailure =
  | "unsupported-platform" // not Windows
  | "not-installed" // the binary is missing from this install
  | "declined" // the admin dismissed the UAC prompt
  | "no-interactive-desktop" // Session 0 / container / headless — cannot prompt
  | "invalid-request" // rejected by the binary's own grammar
  | "failed"; // everything else

export type GrantResult<T> = { ok: true; value: T } | { ok: false; reason: GrantFailure; message: string };

/**
 * Exit codes, mirrored from tools/grant/Program.cs. Kept in step by
 * tests/unit/elevation.test.ts, which fails if the binary's --help stops documenting them —
 * two copies of a contract need something that notices when they diverge.
 */
const EXIT = { ok: 0, usage: 2, failed: 3, noDesktop: 4, declined: 1223 } as const;

/** Longer than a UAC prompt should ever sit unanswered, short enough not to hang a request. */
const TIMEOUT_MS = 120_000;

/**
 * The binary ships inside the release archive at `bin/jondash-grant.exe`, so it sits next to
 * the app rather than anywhere the user configures. Resolved here and nowhere else.
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
      // Stated plainly rather than hinted at: the Linux design exists (OPS-18) but is not
      // built, because JonDash has no Linux launcher yet (OPS-19).
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

type RunOutcome = { code: number; stdout: string; stderr: string };

function run(args: string[]): Promise<RunOutcome> {
  return new Promise((resolve) => {
    // execFile, never a shell: arguments are passed as an argv array, so nothing in a service
    // name can be reinterpreted as shell syntax. A `shell: true` here would undo the binary's
    // whole grammar argument.
    execFile(grantBinaryPath(), args, { timeout: TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      const code =
        err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === "number"
          ? ((err as unknown as { code: number }).code)
          : err
            ? EXIT.failed
            : EXIT.ok;
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

function classify(o: RunOutcome): GrantFailure {
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

async function invoke<T>(
  args: string[],
  auditAction: string,
  auditDetail: string,
  parse: (o: RunOutcome) => T,
  opts: { userId?: string | null } = {},
): Promise<GrantResult<T>> {
  const support = grantSupport();
  if (!support.available) return { ok: false, reason: support.reason, message: support.message };

  const outcome = await run(args);

  // Audited whatever happened, including declined and failed. A log that only records
  // successes cannot answer "did anyone try?", which is the question that matters after an
  // incident. Best-effort by design — `audit` swallows its own failures.
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
 * Create the grants for one entry. All the verbs go in a single call ON PURPOSE: that is one
 * UAC prompt for the decision actually being made — "may JonDash control this service" —
 * rather than three prompts carrying no extra information, which would just teach the admin
 * to click through them.
 *
 * Needs an interactive desktop, because somebody has to answer the prompt. Using a grant
 * afterwards does not — that asymmetry is what makes unattended automation possible.
 */
export async function createGrant(input: {
  service: string;
  verbs: GrantVerb[];
  /** Optional name for the task; defaults to the service name. Sanitised by the binary. */
  id?: string;
  /** The Windows account JonDash runs as, which will be allowed to RUN the task (not edit it). */
  account?: string;
  /** Who approved it, recorded in the task's Description so Task Scheduler reads as an audit trail. */
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

  return invoke(
    args,
    "elevation.grant.create",
    `${input.service} [${input.verbs.join(",")}]${input.once ? " once" : ""}`,
    (o) => o.stdout.split("\n").map((l) => l.trim()).filter(Boolean),
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
 * Remove EVERY grant and the `\JonDash\` folder. This is the uninstall path — nothing
 * elevated may outlive the thing that justified it (owner requirement, 2026-07-25).
 *
 * It needs elevation, so it cannot be silent. If the admin declines, the caller must say
 * plainly that grants remain and how to remove them by hand, rather than reporting a clean
 * uninstall — a leftover elevated task nobody knows about is the worst outcome here.
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
 * What is actually granted, read from Windows rather than from any record of ours — so it
 * cannot drift from reality, and an orphan left by a skipped uninstall still shows up.
 *
 * Needs no elevation and writes no audit entry: reading is not a privileged act, and a UAC
 * prompt merely to answer "what may JonDash do?" would train people to click through.
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

/**
 * What a name will become once sanitised. Exposed so a UI can show the real task name before
 * an admin approves it — the case for readable names is that Task Scheduler can be read, and
 * that only holds if what appears there is what they were shown.
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
