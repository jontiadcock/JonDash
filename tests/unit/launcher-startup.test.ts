import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readOpenBrowser, writeOpenBrowser } from "@/lib/launcher-prefs";

/**
 * OPS-06 — the browser auto-open can be switched off.
 *
 * Two routes, and the test covers both because they exist for different people: the flag file
 * is what an admin sets from inside JonDash, and the environment variable is the only thing
 * that helps on a headless box — a switch inside the app cannot be reached by somebody who
 * cannot see the window it just opened.
 * REFS lib/launcher-prefs.ts
 */
const DATA_DIR = path.join(process.cwd(), ".data-test-launcher");
const prev = process.env.JONDASH_DATA_DIR;

beforeEach(() => {
  process.env.JONDASH_DATA_DIR = DATA_DIR;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  if (prev === undefined) delete process.env.JONDASH_DATA_DIR;
  else process.env.JONDASH_DATA_DIR = prev;
});

describe("browser auto-open preference", () => {
  it("opens a browser by default, so nothing changes for an existing install", () => {
    expect(readOpenBrowser()).toBe(true);
  });

  it("switching it off is durable, and switching it back on removes the marker", () => {
    writeOpenBrowser(false);
    expect(readOpenBrowser()).toBe(false);
    expect(fs.existsSync(path.join(DATA_DIR, "no-browser"))).toBe(true);

    writeOpenBrowser(true);
    expect(readOpenBrowser()).toBe(true);
    expect(fs.existsSync(path.join(DATA_DIR, "no-browser"))).toBe(false);
  });

  it("creates the data directory when it does not exist yet", () => {
    // First run: `.data` may not be there at all, and a failure to write would silently leave
    // the setting un-saved with the UI claiming otherwise.
    expect(fs.existsSync(DATA_DIR)).toBe(false);
    writeOpenBrowser(false);
    expect(readOpenBrowser()).toBe(false);
  });
});

describe("the launcher honours both routes", () => {
  /**
   * Source-level: the launcher is a .bat that cannot be imported or executed here, and the
   * failure mode is "someone deleted a line", which no runtime test of the app would notice.
   */
  const BAT = fs.readFileSync(path.join(process.cwd(), "start-dashboard.bat"), "utf8");
  const CODE = BAT.split("\n")
    .filter((l) => !/^\s*REM\b/i.test(l))
    .join("\n");

  it("checks the flag file", () => {
    expect(CODE).toMatch(/if exist "\.data\\no-browser" set "OPENBROWSER="/);
  });

  it("checks the environment variable, for a machine with no screen", () => {
    expect(CODE).toMatch(/if defined JONDASH_NO_BROWSER set "OPENBROWSER="/);
  });

  it("still only opens on a FIRST launch, never on every restart", () => {
    expect(CODE).toMatch(/if "%~2"=="first" if defined OPENBROWSER start "" "%DISPLAYURL%"/);
  });

  it("has no unguarded browser launch left", () => {
    const launches = CODE.match(/start "" "%DISPLAYURL%"/g) ?? [];
    expect(launches.length, "more than one place opens a browser").toBe(1);
  });
});
