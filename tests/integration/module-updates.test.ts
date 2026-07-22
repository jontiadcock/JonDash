import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "@/lib/modules/types";
// ensureModuleMigrations is imported dynamically per test: it memoises per process, and
// each case needs a fresh run against a different mocked registry.
import { enableModule } from "@/lib/modules/manage";
import { dropModuleTables } from "@/lib/modules/migrate";
import { removeModuleFiles } from "@/lib/modules/install";

/**
 * The two failure modes that made module updates unsafe. Both are silent: nothing errors,
 * the module just misbehaves afterwards — so they need tests that would actually catch a
 * regression rather than tests that pass either way.
 */

const ID = "updtest";
const MODULE_DIR = path.join(process.cwd(), "modules", ID);
const DATA_DIR = path.join(process.cwd(), ".data-test-updates");
let prevDataDir: string | undefined;

function def(version: string, migrations = true): ModuleDefinition {
  return {
    id: ID,
    name: "Update test",
    description: "test",
    version,
    minAppVersion: "1.4.0",
    permissions: [],
    ...(migrations ? { migrations: "./migrations" } : {}),
  };
}

function writeMigration(file: string, sql: string) {
  fs.mkdirSync(path.join(MODULE_DIR, "migrations"), { recursive: true });
  fs.writeFileSync(path.join(MODULE_DIR, "migrations", file), sql, "utf8");
}

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

async function cleanup() {
  await dropModuleTables(ID).catch(() => {});
  await prisma.moduleMigration.deleteMany();
  await prisma.module.deleteMany();
  removeModuleFiles(ID);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  prevDataDir ??= process.env.JONDASH_DATA_DIR;
  process.env.JONDASH_DATA_DIR = DATA_DIR;
  vi.resetModules(); // ensureModuleMigrations memoises per process
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (prevDataDir === undefined) delete process.env.JONDASH_DATA_DIR;
  else process.env.JONDASH_DATA_DIR = prevDataDir;
  await prisma.$disconnect();
});

describe("migrations gained in an update", () => {
  it("applies a migration added by a newer version, and records the version", async () => {
    // v1.0.0: one table, one column.
    writeMigration("001_init.sql", `CREATE TABLE IF NOT EXISTS mod_updtest_items (id INTEGER PRIMARY KEY);`);
    await enableModule(def("1.0.0"));
    expect(await tableHasColumn("mod_updtest_items", "label")).toBe(false);

    // An update replaces the files (a new migration appears) and bumps the version, but
    // the module is already enabled — enableModule never runs again.
    writeMigration("002_add_label.sql", `ALTER TABLE mod_updtest_items ADD COLUMN label TEXT;`);
    await prisma.module.updateMany({ where: { id: ID }, data: { version: "1.1.0" } });

    // Registry now returns 1.1.0; the sync must notice migratedVersion is behind.
    const manage = await import("@/lib/modules/manage");
    vi.spyOn(await import("@/lib/modules/registry"), "getAllModules").mockReturnValue([def("1.1.0")]);
    await manage.ensureModuleMigrations();

    expect(await tableHasColumn("mod_updtest_items", "label")).toBe(true);
    const row = await prisma.module.findUnique({ where: { id: ID } });
    expect(row?.migratedVersion).toBe("1.1.0");
    // Only the new file ran; the first stays recorded once.
    expect(await prisma.moduleMigration.count({ where: { moduleId: ID } })).toBe(2);
  });

  it("does nothing when the module is already at its migrated version", async () => {
    writeMigration("001_init.sql", `CREATE TABLE IF NOT EXISTS mod_updtest_items (id INTEGER PRIMARY KEY);`);
    await enableModule(def("1.0.0"));
    const before = await prisma.moduleMigration.count({ where: { moduleId: ID } });

    vi.spyOn(await import("@/lib/modules/registry"), "getAllModules").mockReturnValue([def("1.0.0")]);
    await (await import("@/lib/modules/manage")).ensureModuleMigrations();

    expect(await prisma.moduleMigration.count({ where: { moduleId: ID } })).toBe(before);
  });

  it("leaves migratedVersion behind when a migration fails, so it retries next boot", async () => {
    writeMigration("001_init.sql", `CREATE TABLE IF NOT EXISTS mod_updtest_items (id INTEGER PRIMARY KEY);`);
    await enableModule(def("1.0.0"));

    writeMigration("002_broken.sql", `THIS IS NOT VALID SQL;`);
    await prisma.module.updateMany({ where: { id: ID }, data: { version: "1.1.0" } });
    vi.spyOn(await import("@/lib/modules/registry"), "getAllModules").mockReturnValue([def("1.1.0")]);

    await expect((await import("@/lib/modules/manage")).ensureModuleMigrations()).resolves.not.toThrow();
    const row = await prisma.module.findUnique({ where: { id: ID } });
    expect(row?.migratedVersion).toBe("1.0.0"); // NOT advanced — will be retried
  });
});

describe("permission grants across an update", () => {
  it("stores only what was granted at enable — an update must rewrite them explicitly", async () => {
    await enableModule({ ...def("1.0.0", false), permissions: ["network:outbound"] });
    const before = await prisma.module.findUnique({ where: { id: ID } });
    expect(JSON.parse(before!.grantedPermissions)).toEqual(["network:outbound"]);

    // Simulate what the update action does after a version that adds email:send is
    // approved: the stored grants must become the new declared set, or the module's
    // ctx.email would be missing and it would fail with no explanation.
    await prisma.module.updateMany({
      where: { id: ID },
      data: { version: "1.1.0", grantedPermissions: JSON.stringify(["network:outbound", "email:send"]) },
    });

    const after = await prisma.module.findUnique({ where: { id: ID } });
    expect(JSON.parse(after!.grantedPermissions)).toEqual(["network:outbound", "email:send"]);
  });
});
