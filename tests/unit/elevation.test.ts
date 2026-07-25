import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * OPS-18. Two things nothing else would notice:
 *
 *  1. The exit codes live in BOTH `tools/grant/Program.cs` and `lib/elevation.ts`. Two copies
 *     of a contract drift silently, and the symptom would be JonDash telling somebody an
 *     operation failed when they had simply declined the prompt.
 *  2. The binary must actually ship. It is committed rather than built on the user's machine,
 *     so a missing or export-ignored file is a broken feature nobody sees until a grant is
 *     attempted on a real install.
 *
 * The name vectors run against the real binary on Windows and are skipped elsewhere, so CI's
 * ubuntu leg stays green without pretending it verified anything.
 */
const ROOT = process.cwd();
const BIN = path.join(ROOT, "bin", "jondash-grant.exe");
const SRC = path.join(ROOT, "tools", "grant", "Program.cs");
const onWindows = process.platform === "win32";

describe("elevation: the binary ships", () => {
  it("is committed at bin/jondash-grant.exe", () => {
    expect(fs.existsSync(BIN), `missing ${BIN} — run tools/grant/build.ps1`).toBe(true);
  });

  it("is small enough to belong in a source repo", () => {
    // It is committed, so every clone carries it and git stores each rebuild as a full blob.
    // A jump here means someone changed the toolchain (a self-contained .NET build is ~15 MB,
    // a Node SEA ~60 MB+) and the trade-off deserves a fresh decision, not a silent commit.
    expect(fs.statSync(BIN).size).toBeLessThan(256 * 1024);
  });

  it("keeps its source alongside it, so the artifact can be rebuilt and verified", () => {
    // A privileged binary nobody can reproduce is a supply-chain smell.
    expect(fs.existsSync(SRC)).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "tools", "grant", "build.ps1"))).toBe(true);
  });

  it("is not stripped from the release archive by .gitattributes", () => {
    // The updater downloads the git tag archive, so an export-ignore on bin/ would ship an
    // install with no binary and no error until a grant was attempted.
    const attrs = fs.readFileSync(path.join(ROOT, ".gitattributes"), "utf8");
    for (const line of attrs.split(/\r?\n/)) {
      if (!line.includes("export-ignore")) continue;
      const target = line.trim().split(/\s+/)[0]!;
      expect(target.replace(/^\//, "").startsWith("bin"), `bin is export-ignored by: ${line}`).toBe(false);
      expect(target.replace(/^\//, "").startsWith("tools"), `tools is export-ignored by: ${line}`).toBe(false);
    }
  });
});

describe("elevation: exit codes agree between the binary and lib/elevation.ts", () => {
  const cs = fs.readFileSync(SRC, "utf8");
  const ts = fs.readFileSync(path.join(ROOT, "lib", "elevation.ts"), "utf8");

  const expected: Record<string, number> = { ok: 0, usage: 2, failed: 3, noDesktop: 4, declined: 1223 };

  it("the C# constants are what lib/elevation.ts assumes", () => {
    const csCodes: Record<string, number> = {
      ok: Number(/ExitOk\s*=\s*(\d+)/.exec(cs)?.[1]),
      usage: Number(/ExitUsage\s*=\s*(\d+)/.exec(cs)?.[1]),
      failed: Number(/ExitFailed\s*=\s*(\d+)/.exec(cs)?.[1]),
      noDesktop: Number(/ExitNoDesktop\s*=\s*(\d+)/.exec(cs)?.[1]),
      declined: Number(/ExitDeclined\s*=\s*(\d+)/.exec(cs)?.[1]),
    };
    expect(csCodes).toEqual(expected);
  });

  it("the TypeScript EXIT map matches", () => {
    const block = /const EXIT = \{([^}]*)\}/.exec(ts)?.[1] ?? "";
    const tsCodes: Record<string, number> = {};
    for (const m of block.matchAll(/(\w+):\s*(\d+)/g)) tsCodes[m[1]!] = Number(m[2]);
    expect(tsCodes).toEqual(expected);
  });

  it("1223 is ERROR_CANCELLED — declined must never be reported as a failure", () => {
    expect(expected.declined).toBe(1223);
    expect(ts).toContain('"declined"');
  });

  it("a timeout is its own outcome, not folded into failed", () => {
    // Node signals a timeout by KILLING the child, which leaves no exit code. Without an
    // explicit check that silently became "failed", so someone taking three minutes over a UAC
    // prompt would have been told the operation broke.
    expect(ts).toContain('"timed-out"');
    expect(ts).toMatch(/killed/);
  });

  it("granting fails closed when it cannot be audited; revoking does not", () => {
    // The asymmetry is deliberate and the direction matters: an unrecorded revocation is a gap
    // in the log, but an unrevoked grant is a live capability nobody wanted.
    expect(ts).toContain('"not-audited"');
    expect(ts).toMatch(/mustAudit:\s*true/);
    // Exactly one call site opts in — createGrant. If a second appears, it needs justifying.
    expect(ts.match(/mustAudit:\s*true/g)?.length).toBe(1);
  });

  it("createGrant reads its result back from Windows, not from the child's stdout", () => {
    // `--create` re-launches itself elevated and the elevated process owns its own console, so
    // nothing reaches us — this silently returned an empty array on success (found by manual
    // testing 2026-07-25, before any consumer depended on it).
    //
    // The tempting fix is to pass the child a path to write results to. That would be an
    // ARBITRARY FILE WRITE AS ADMINISTRATOR, because we choose the path while unprivileged:
    // `--result C:\Windows\System32\anything`. Guard against it being "simplified" back.
    // Sliced to the next top-level export rather than regex-matched to a closing brace: the
    // signature has its own `}` (an inline parameter type), so a non-greedy match captured only
    // the signature and the assertion below passed for the wrong reason.
    const from = ts.indexOf("export async function createGrant");
    const to = ts.indexOf("\nexport ", from + 1);
    const create = ts.slice(from, to === -1 ? undefined : to);
    expect(create).toContain("listGrants()");
    // `o.stdout` is the actual read; a bare /stdout/ also matches the comment explaining why we
    // don't use it, which would fail for the wrong reason.
    expect(create).not.toMatch(/o\.stdout/);
    // As a quoted argument, not as the word — the comment above names `--result` precisely to
    // explain why it must never be passed, and matching prose fails for the wrong reason.
    expect(ts).not.toContain('"--result"');
  });

  it("using a grant is audited too, not just granting and revoking one", () => {
    // The privileged EFFECT is the service restart. Logging only create/remove would leave the
    // moment that matters absent from the log built to record it.
    expect(ts).toContain("elevation.grant.run");
    expect(ts).toMatch(/export async function runGrant/);
  });
});

describe.runIf(onWindows)("elevation: name handling (the path-escape defence)", () => {
  const check = (name: string) =>
    execFileSync(BIN, ["--check-name", name], { encoding: "utf8", windowsHide: true }).trim();

  // Agreed with the add-ons session: readable names, [A-Za-z0-9._-], max 64. They sanitise
  // independently and BOTH layers stay — so these vectors are the shared conformance set.
  it.each([
    ["Plex", "Plex"],
    ["My Service", "MyService"],
    ["Web.Server_01", "Web.Server_01"],
    ["-lead-and-trail-", "lead-and-trail"],
    ["...", ""],
  ])("sanitises %j to %j", (input, want) => {
    expect(check(input)).toBe(want);
  });

  // The one that matters: backslash is Task Scheduler's folder separator, so a name that kept
  // one could place a task outside \JonDash\ — where our permissions and our removal do not reach.
  it.each([
    "Plex\\Foo",
    "..\\..\\Windows\\System32\\evil",
    "\\Malware",
    "\\\\server\\share\\x",
    "C:\\Windows\\x",
  ])("strips every path separator from %j", (evil) => {
    expect(check(evil)).not.toMatch(/[\\/:]/);
  });

  it("truncates to 64 characters", () => {
    expect(check("A".repeat(200)).length).toBe(64);
  });

  it("refuses --run without a grant, and cannot conjure one", () => {
    // Running is unprivileged BY DESIGN — that asymmetry is what allows unattended automation.
    // The safety property is that it can only trigger what an admin already approved, so with
    // no grant present it must fail rather than create anything.
    let code = 0;
    try {
      execFileSync(BIN, ["--run", "--id", "NoSuchGrant"], { windowsHide: true, stdio: "pipe" });
    } catch (e) {
      code = (e as { status?: number }).status ?? -1;
    }
    expect(code).toBe(3); // failed, not usage — the request was well-formed, the grant isn't there
  });

  it("rejects a verb outside the grammar", () => {
    // There is deliberately no syntax for "run this command"; an unknown verb takes the whole
    // request down rather than being partially honoured.
    let code = 0;
    try {
      execFileSync(BIN, ["--create", "--service", "Spooler", "--verb", "nuke"], { windowsHide: true, stdio: "pipe" });
    } catch (e) {
      code = (e as { status?: number }).status ?? -1;
    }
    expect(code).toBe(2);
  });
});
