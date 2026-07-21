import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Exercises scripts/rollback.mjs against a fake install in a temp dir (JONDASH_ROOT).

const ROLLBACK = path.resolve(process.cwd(), "scripts/rollback.mjs");

function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [ROLLBACK, ...args], {
    env: { ...process.env, JONDASH_ROOT: root },
    encoding: "utf8",
  });
}

describe("rollback snapshot", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "jd-rb-"));
    // A fake install: source (must be snapshotted) + things that must NOT be.
    fs.mkdirSync(path.join(root, "app"), { recursive: true });
    fs.mkdirSync(path.join(root, "prisma"), { recursive: true });
    fs.mkdirSync(path.join(root, "node_modules", "x"), { recursive: true });
    fs.mkdirSync(path.join(root, ".data"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
    fs.writeFileSync(path.join(root, "app", "page.tsx"), "GOOD");
    fs.writeFileSync(path.join(root, "prisma", "schema.prisma"), "schema");
    fs.writeFileSync(path.join(root, "prisma", "dev.db"), "USERDATA");
    fs.writeFileSync(path.join(root, "node_modules", "x", "big.js"), "dep");
    fs.writeFileSync(path.join(root, ".data", "secret"), "KEY");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("backs up source only, then restores like-for-like without touching user data", () => {
    expect(run(root, "backup").status).toBe(0);
    const snap = path.join(root, ".data", "rollback", "snapshot");
    expect(fs.existsSync(path.join(snap, "app", "page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(snap, "prisma", "schema.prisma"))).toBe(true);
    expect(fs.existsSync(path.join(snap, "prisma", "dev.db"))).toBe(false); // DB excluded
    expect(fs.existsSync(path.join(snap, "node_modules"))).toBe(false); // regenerable excluded
    expect(fs.existsSync(path.join(snap, ".data"))).toBe(false); // user data excluded
    expect(fs.readFileSync(path.join(root, ".data", "rollback", "version"), "utf8")).toBe("1.0.0");

    // Simulate a bad update overwriting source + bumping the version.
    fs.writeFileSync(path.join(root, "app", "page.tsx"), "BAD");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "2.0.0" }));

    expect(run(root, "restore").status).toBe(0);
    expect(fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8")).toBe("GOOD");
    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version).toBe("1.0.0");
    // User data survived the restore.
    expect(fs.readFileSync(path.join(root, "prisma", "dev.db"), "utf8")).toBe("USERDATA");
    expect(fs.readFileSync(path.join(root, ".data", "secret"), "utf8")).toBe("KEY");
  });

  it("mark-failed records the failed + reverted-to versions for the app notice", () => {
    run(root, "backup"); // records revertedTo = 1.0.0
    expect(run(root, "mark-failed", "2.0.0").status).toBe(0);
    const rec = JSON.parse(fs.readFileSync(path.join(root, ".data", "update-failed"), "utf8"));
    expect(rec.failedVersion).toBe("2.0.0");
    expect(rec.revertedTo).toBe("1.0.0");
  });
});
