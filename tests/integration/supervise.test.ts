import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Exercises scripts/supervise.mjs by driving it against a fake server whose
// behaviour is controlled by env, with tiny crash-loop thresholds. Verifies the
// decision logic via the supervisor's exit codes (what the launcher branches on).

const SUPERVISE = path.resolve(process.cwd(), "scripts/supervise.mjs");

function makeFakeServer(dir: string): string {
  const p = path.join(dir, "fake-server.mjs");
  fs.writeFileSync(
    p,
    [
      'import fs from "node:fs"; import path from "node:path";',
      'const root = process.env.JONDASH_ROOT || process.cwd();',
      'if (process.env.JONDASH_FAKE_MODE === "sentinel") {',
      '  fs.writeFileSync(path.join(root, ".update-and-restart"), "x");',
      "  process.exit(0);",
      "}",
      'if (process.env.JONDASH_FAKE_MODE === "clean") process.exit(0);',
      'if (process.env.JONDASH_FAKE_MODE === "control") process.exit(3221225786); // 0xC000013A',
      "process.exit(1); // crash immediately",
      "",
    ].join("\n"),
  );
  return p;
}

function runSupervisor(root: string, fake: string, mode: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SUPERVISE], {
      cwd: root,
      env: {
        ...process.env,
        JONDASH_ROOT: root,
        JONDASH_SERVER_CMD: fake,
        JONDASH_FAKE_MODE: mode,
        JONDASH_MIN_UPTIME_MS: "1500",
        JONDASH_MAX_CRASHES: "2",
        JONDASH_RESTART_DELAY_MS: "50",
      },
      stdio: "ignore",
    });
    child.on("exit", (code) => resolve(code ?? -1));
  });
}

describe("server supervisor", () => {
  let dir: string;
  let fake: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jd-sup-"));
    fs.mkdirSync(path.join(dir, ".data"), { recursive: true });
    fake = makeFakeServer(dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("exits 10 when the server requests an update (sentinel present)", async () => {
    expect(await runSupervisor(dir, fake, "sentinel")).toBe(10);
  }, 15000);

  it("gives up with 12 after a boot-crash loop (no update in progress)", async () => {
    expect(await runSupervisor(dir, fake, "crash")).toBe(12);
  }, 15000);

  it("signals a revert (11) on a boot-crash loop right after an update", async () => {
    fs.writeFileSync(path.join(dir, ".data", "post-update"), "1");
    expect(await runSupervisor(dir, fake, "crash")).toBe(11);
  }, 15000);

  it("exits cleanly (0) on a plain exit — does not restart", async () => {
    expect(await runSupervisor(dir, fake, "clean")).toBe(0);
  }, 15000);

  it("exits cleanly (0) on a console-control termination (0xC000013A) — no restart loop", async () => {
    // The bug: the server was being ended by a console-control event and the
    // supervisor treated it as a crash and restarted, looping. It must stop.
    expect(await runSupervisor(dir, fake, "control")).toBe(0);
  }, 15000);
});
