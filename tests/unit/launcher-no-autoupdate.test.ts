import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * **The launcher never updates JonDash on its own** (owner's decision, 2026-07-28).
 *
 * *"Just remove the auto update functionality from the launcher… it must be a scheduled update,
 * or manually updated from within the app… this means that the launcher will never update the
 * software automatically."*
 *
 * There used to be **two** things that could replace the app — the launcher at every startup, and
 * the in-process scheduler at the configured time — and only the second respected the schedule.
 * That is BUG-61 (JonDash updated itself with automatic updates switched off) and half of BUG-63
 * (Shut down restarted the server *and* installed an update). Removing the path dissolves both,
 * rather than patching around them.
 *
 * **Source-level, and it has to be.** The defect this guards against is a line reappearing in a
 * batch file that only runs on a real Windows boot — there is no behaviour to observe from a test
 * process, and by the time anyone observed it, an install would already have been replaced without
 * being asked. A launcher change also carries brick-risk, so the assertions are about shape rather
 * than wording.
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

// A regex over source is a regex over comments too (BUG-39) — and both files explain at length
// what they no longer do, naming the very things being asserted absent.
const stripBat = (s: string) => s.replace(/^\s*REM\b.*$/gim, "");
const stripJs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BAT = stripBat(read("start-dashboard.bat"));
const UPDATE = stripJs(read("scripts", "update.mjs"));

/**
 * The body of one batch label, from its definition to the next label.
 *
 * Anchored to the start of a line: `indexOf(":check_for_updates")` finds the **call site**
 * (`call :check_for_updates`) before the label it defines, which silently swept the whole of
 * stage 1 into the slice and failed on an `errorlevel` that belonged to something else.
 */
function label(src: string, name: string): string {
  const start = src.search(new RegExp(`^:${name}\\b`, "m"));
  expect(start, `label :${name} not found in start-dashboard.bat`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const end = rest.search(/^:[a-z_]+\b/m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the launcher cannot install an update", () => {
  it("never runs the updater's apply step at startup", () => {
    // `:do_update` still applies — that is the IN-APP path, reached only when the running server
    // asks for it (supervisor exit 10). What must not exist is an apply on the startup path.
    expect(label(BAT, "check_for_updates"), "the startup check applies an update").not.toMatch(
      /update\.mjs"?\s+apply/,
    );
  });

  it("does not branch on the updater's exit code at startup", () => {
    // Exit 10 used to mean "auto-install is on, install now". Acting on any exit code here is the
    // shape of that bug returning.
    expect(label(BAT, "check_for_updates"), "the startup check acts on an exit code again").not.toMatch(
      /errorlevel/i,
    );
  });

  it("still checks, so an update is at least reported", () => {
    expect(
      label(BAT, "check_for_updates"),
      "the startup check is gone entirely — nothing tells anyone an update exists",
    ).toMatch(/update\.mjs"?\s+autocheck/);
  });

  it("autocheck reports and never signals an install", () => {
    const fn = UPDATE.slice(UPDATE.indexOf("async function cmdAutoCheck"));
    const body = fn.slice(0, fn.indexOf("\nasync function "));
    expect(body, "cmdAutoCheck returns the install signal again").not.toMatch(/return\s+10\b/);
  });

  it("has no auto-install switch left for the launcher to read", () => {
    // `.data/auto-update` still exists, but as the app's entry in the per-item exclusion list
    // that the SCHEDULER reads — nothing pre-boot may consult it to decide to install.
    expect(UPDATE, "the launcher reads the auto-install flag again").not.toMatch(
      /"auto-update"/,
    );
  });
});

describe("scheduled updates cover JonDash itself", () => {
  /*
   * Required for the owner's instruction to be true rather than half-true: with the launcher no
   * longer installing anything, the scheduler is the ONLY automatic path. Without this, turning
   * on automatic updates would quietly cover add-ons and never the app.
   */
  const AUTORUN = stripJs(read("lib", "updates", "auto-run.ts"));
  const SCHEDULER = stripJs(read("lib", "updates", "scheduler.ts"));

  it("decides whether the app is included, the same way as everything else", () => {
    expect(AUTORUN).toMatch(/readAutoInstall\(\)/);
  });

  it("reports the app update rather than applying it mid-run", () => {
    // Applying ends the process; doing it inside the run would kill it before the audit entry
    // that records what happened.
    expect(AUTORUN).toMatch(/appUpdate/);
    expect(AUTORUN, "auto-run must not end the process itself").not.toMatch(/requestUpdateRestart/);
    expect(SCHEDULER, "the scheduler never applies the app update").toMatch(/requestUpdateRestart/);
  });

  it("never re-applies a version that already failed and was rolled back", () => {
    // On a schedule, retrying a broken version is a rebuild-and-revert cycle every window.
    expect(AUTORUN).toMatch(/readUpdateFailure\(\)/);
  });

  it("audits the app update before the restart it causes", () => {
    const auditAt = AUTORUN.indexOf("appUpdate ?");
    expect(auditAt, "the audit entry does not mention the app update").toBeGreaterThan(-1);
  });
});
