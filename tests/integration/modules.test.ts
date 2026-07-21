import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "@/lib/modules/types";
import { moduleSettingsApi, moduleStoreApi } from "@/lib/modules/store";
import { runModuleMigrations, dropModuleTables, moduleTableName } from "@/lib/modules/migrate";
import { buildModuleContext } from "@/lib/modules/context";
import { enableModule, disableModule, uninstallModule } from "@/lib/modules/manage";
import { decryptString } from "@/lib/crypto";

// A plain module definition pointing at the REAL bundled sample module's migrations dir
// (so the raw-SQL runner is genuinely exercised) but WITHOUT importing its React
// components — keeps this a pure node integration test.
function sampleDef(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    id: "sample",
    name: "Sample",
    description: "test",
    version: "1.0.0",
    minAppVersion: "1.4.0",
    permissions: [],
    settings: [
      { key: "heading", label: "Heading", type: "string", default: "Quick notes" },
      { key: "token", label: "Token", type: "string", secret: true },
    ],
    migrations: "./migrations",
    ...overrides,
  };
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    name,
  );
  return rows.length > 0;
}

async function cleanup() {
  await dropModuleTables("sample").catch(() => {});
  await prisma.moduleMigration.deleteMany();
  await prisma.moduleRecord.deleteMany();
  await prisma.module.deleteMany();
  await prisma.setting.deleteMany({ where: { scope: "module" } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("module framework", () => {
  it("settings round-trip; secret values are encrypted at rest", async () => {
    const s = moduleSettingsApi(sampleDef());
    expect(await s.get("heading")).toBe("Quick notes"); // default
    await s.set("heading", "Hi");
    await s.set("token", "sekret");
    expect(await s.get("heading")).toBe("Hi");
    expect(await s.get("token")).toBe("sekret");

    const row = await prisma.setting.findUnique({
      where: { scope_ownerId_key: { scope: "module", ownerId: "sample", key: "token" } },
    });
    expect(row?.secret).toBe(true);
    expect(row?.valueJson).not.toContain("sekret"); // stored encrypted, not plaintext
    expect(JSON.parse(decryptString(row!.valueJson))).toBe("sekret");
  });

  it("generic store: set / get / list / delete", async () => {
    const store = moduleStoreApi("sample");
    await store.set("a", { n: 1 });
    await store.set("b", 2);
    expect(await store.get("a")).toEqual({ n: 1 });
    expect((await store.list()).map((r) => r.key)).toEqual(["a", "b"]);
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
  });

  it("runs raw-SQL migrations into a namespaced table (idempotent), drops on uninstall", async () => {
    const def = sampleDef();
    expect(moduleTableName("sample", "notes")).toBe("mod_sample_notes");

    await runModuleMigrations(def);
    expect(await tableExists("mod_sample_notes")).toBe(true);

    await runModuleMigrations(def); // re-run = no-op
    expect(await prisma.moduleMigration.count({ where: { moduleId: "sample" } })).toBe(1);

    await dropModuleTables("sample");
    expect(await tableExists("mod_sample_notes")).toBe(false);
    expect(await prisma.moduleMigration.count({ where: { moduleId: "sample" } })).toBe(0);
  });

  it("context exposes ONLY granted capabilities", async () => {
    const def = sampleDef();
    const none = buildModuleContext(def, [], null);
    expect(none.crypto).toBeUndefined();
    expect(none.fetch).toBeUndefined();
    expect(none.audit).toBeUndefined();
    expect(none.db).toBeDefined(); // ships migrations => owns tables (baseline)

    const granted = buildModuleContext(
      { ...def, permissions: ["crypto:use", "network:outbound", "audit:write"] },
      ["crypto:use", "network:outbound", "audit:write"],
      null,
    );
    expect(granted.crypto).toBeDefined();
    expect(granted.fetch).toBeDefined();
    expect(granted.audit).toBeDefined();

    const noTables = buildModuleContext({ ...def, migrations: undefined }, [], null);
    expect(noTables.db).toBeUndefined();
  });

  it("enable → row + migrations + onEnable write; uninstall purges everything", async () => {
    let onEnableRan = false;
    const def = sampleDef({
      onEnable: async (ctx) => {
        if (ctx.db) {
          await ctx.db.run(
            `INSERT INTO ${ctx.db.table("notes")} (text, createdAt) VALUES (?, ?)`,
            "hi",
            new Date().toISOString(),
          );
          onEnableRan = true;
        }
      },
    });

    await enableModule(def);
    expect((await prisma.module.findUnique({ where: { id: "sample" } }))?.enabled).toBe(true);
    expect(onEnableRan).toBe(true);
    const cnt = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*) AS n FROM mod_sample_notes`);
    expect(Number(cnt[0].n)).toBe(1);

    await moduleSettingsApi(def).set("heading", "X");
    await moduleStoreApi("sample").set("k", 1);

    await disableModule(def);
    expect((await prisma.module.findUnique({ where: { id: "sample" } }))?.enabled).toBe(false);

    await uninstallModule(def);
    expect(await prisma.module.findUnique({ where: { id: "sample" } })).toBeNull();
    expect(await tableExists("mod_sample_notes")).toBe(false);
    expect(await prisma.setting.count({ where: { scope: "module", ownerId: "sample" } })).toBe(0);
    expect(await prisma.moduleRecord.count({ where: { moduleId: "sample" } })).toBe(0);
    expect(await prisma.moduleMigration.count({ where: { moduleId: "sample" } })).toBe(0);
  });
});
