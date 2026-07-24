import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { runModuleMigrations } from "@/lib/modules/migrate";
import type { ModuleDefinition } from "@/lib/modules/types";

// BUG-32: a module migration file must run in ONE transaction. Before the fix, statements
// applied one at a time and the "applied" record was written only after the whole file — so
// a mid-file failure committed the earlier statements while leaving the file unrecorded, and
// the next attempt re-ran from statement 1 and died on the same non-idempotent DDL forever
// (SQLite has no ADD COLUMN / CREATE TABLE IF-NOT-EXISTS by default here).

const ID = "bug32test";
const MOD_DIR = path.join(process.cwd(), "modules", ID);
const MIG_DIR = path.join(MOD_DIR, "migrations");
const PROBE = "mod_bug32test_probe";

function writeMigration(name: string, sql: string) {
  fs.mkdirSync(MIG_DIR, { recursive: true });
  // clear any file from a previous case so only `name` is present
  for (const f of fs.readdirSync(MIG_DIR)) fs.rmSync(path.join(MIG_DIR, f));
  fs.writeFileSync(path.join(MIG_DIR, name), sql);
}

const def = { id: ID, migrations: "./migrations" } as unknown as ModuleDefinition;

async function probeExists(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    PROBE,
  );
  return rows.length > 0;
}

afterAll(async () => {
  fs.rmSync(MOD_DIR, { recursive: true, force: true });
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${PROBE}`);
  await prisma.moduleMigration.deleteMany({ where: { moduleId: ID } });
});

describe("module migrations run atomically (BUG-32)", () => {
  it("applies nothing when a statement fails part-way", async () => {
    // Statement 1 creates the probe table; statement 2 fails (no such table). Without a
    // transaction the CREATE would commit and wedge every retry.
    writeMigration(
      "001_partial.sql",
      `CREATE TABLE ${PROBE} (id INTEGER);\nINSERT INTO mod_bug32test_missing VALUES (1);\n`,
    );

    await expect(runModuleMigrations(def)).rejects.toBeTruthy();

    expect(await probeExists()).toBe(false); // statement 1 rolled back with the failure
    const applied = await prisma.moduleMigration.findMany({ where: { moduleId: ID } });
    expect(applied).toHaveLength(0); // and the file was not recorded as applied
  });

  it("re-running a corrected file then succeeds — no manual recovery", async () => {
    // The first attempt left nothing behind, so replacing the file with valid SQL applies
    // cleanly. Before the fix, the leftover table made this throw "table already exists".
    writeMigration("001_partial.sql", `CREATE TABLE ${PROBE} (id INTEGER);\n`);

    await runModuleMigrations(def);

    expect(await probeExists()).toBe(true);
    const applied = await prisma.moduleMigration.findMany({ where: { moduleId: ID } });
    expect(applied.map((a) => a.filename)).toContain("001_partial.sql");
  });
});
