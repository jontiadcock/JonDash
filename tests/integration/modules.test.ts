import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "@/lib/modules/types";
import { moduleSettingsApi, moduleStoreApi } from "@/lib/modules/store";
import { runModuleMigrations, dropModuleTables, moduleTableName } from "@/lib/modules/migrate";
import { buildModuleContext } from "@/lib/modules/context";
import {
  enableModule,
  disableModule,
  uninstallModule,
  pruneRemovedBundledModules,
  reconcileModuleProvenance,
} from "@/lib/modules/manage";
import { writeProvenance, removeProvenance } from "@/lib/modules/provenance";
import { decryptString } from "@/lib/crypto";

// JonDash ships no modules of its own, but the migration runner reads REAL files from
// modules/<id>/migrations — so lay a throwaway module on disk to exercise it genuinely.
const ID = "testmod";
const MODULE_DIR = path.join(process.cwd(), "modules", ID);

function sampleDef(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    id: ID,
    name: "Test module",
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

// Provenance lives in .data — isolate it so tests never touch the real install's records.
const DATA_DIR = path.join(process.cwd(), ".data-test-modules");
let prevDataDir: string | undefined;

beforeAll(() => {
  prevDataDir = process.env.JONDASH_DATA_DIR;
  process.env.JONDASH_DATA_DIR = DATA_DIR;
  fs.mkdirSync(path.join(MODULE_DIR, "migrations"), { recursive: true });
  fs.writeFileSync(
    path.join(MODULE_DIR, "migrations", "001_init.sql"),
    `-- throwaway fixture
CREATE TABLE IF NOT EXISTS mod_testmod_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL
);`,
  );
});

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    name,
  );
  return rows.length > 0;
}

async function cleanup() {
  removeProvenance(ID); // install records live in .data, not the DB
  await dropModuleTables(ID).catch(() => {});
  await prisma.moduleMigration.deleteMany();
  await prisma.moduleRecord.deleteMany();
  await prisma.module.deleteMany();
  await prisma.setting.deleteMany({ where: { scope: "module" } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  fs.rmSync(MODULE_DIR, { recursive: true, force: true });
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.JONDASH_DATA_DIR;
  else process.env.JONDASH_DATA_DIR = prevDataDir;
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
      where: { scope_ownerId_key: { scope: "module", ownerId: ID, key: "token" } },
    });
    expect(row?.secret).toBe(true);
    expect(row?.valueJson).not.toContain("sekret"); // stored encrypted, not plaintext
    expect(JSON.parse(decryptString(row!.valueJson))).toBe("sekret");
  });

  it("generic store: set / get / list / delete", async () => {
    const store = moduleStoreApi(ID);
    await store.set("a", { n: 1 });
    await store.set("b", 2);
    expect(await store.get("a")).toEqual({ n: 1 });
    expect((await store.list()).map((r) => r.key)).toEqual(["a", "b"]);
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
  });

  it("runs raw-SQL migrations into a namespaced table (idempotent), drops on uninstall", async () => {
    const def = sampleDef();
    expect(moduleTableName(ID, "notes")).toBe("mod_testmod_notes");

    await runModuleMigrations(def);
    expect(await tableExists("mod_testmod_notes")).toBe(true);

    await runModuleMigrations(def); // re-run = no-op
    expect(await prisma.moduleMigration.count({ where: { moduleId: ID } })).toBe(1);

    await dropModuleTables(ID);
    expect(await tableExists("mod_testmod_notes")).toBe(false);
    expect(await prisma.moduleMigration.count({ where: { moduleId: ID } })).toBe(0);
  });

  it("context exposes ONLY granted capabilities", async () => {
    const def = sampleDef();
    const none = buildModuleContext(def, [], null);
    expect(none.crypto).toBeUndefined();
    expect(none.fetch).toBeUndefined();
    expect(none.net).toBeUndefined();
    expect(none.email).toBeUndefined();
    expect(none.audit).toBeUndefined();
    expect(none.db).toBeDefined(); // ships migrations => owns tables (baseline)

    const perms = ["crypto:use", "network:outbound", "audit:write", "email:send"] as const;
    const granted = buildModuleContext({ ...def, permissions: [...perms] }, [...perms], null);
    expect(granted.crypto).toBeDefined();
    expect(granted.fetch).toBeDefined();
    expect(granted.net).toBeDefined(); // ICMP rides on network:outbound
    expect(granted.email).toBeDefined();
    expect(granted.audit).toBeDefined();

    // network:outbound alone must NOT hand out the mailer, and vice versa.
    const netOnly = buildModuleContext(def, ["network:outbound"], null);
    expect(netOnly.net).toBeDefined();
    expect(netOnly.email).toBeUndefined();
    const mailOnly = buildModuleContext(def, ["email:send"], null);
    expect(mailOnly.email).toBeDefined();
    expect(mailOnly.fetch).toBeUndefined();
    expect(mailOnly.net).toBeUndefined();

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
    expect((await prisma.module.findUnique({ where: { id: ID } }))?.enabled).toBe(true);
    expect(onEnableRan).toBe(true);
    const cnt = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*) AS n FROM mod_testmod_notes`);
    expect(Number(cnt[0].n)).toBe(1);

    await moduleSettingsApi(def).set("heading", "X");
    await moduleStoreApi(ID).set("k", 1);

    await disableModule(def);
    expect((await prisma.module.findUnique({ where: { id: ID } }))?.enabled).toBe(false);

    await uninstallModule(def);
    expect(await prisma.module.findUnique({ where: { id: ID } })).toBeNull();
    expect(await tableExists("mod_testmod_notes")).toBe(false);
    expect(await prisma.setting.count({ where: { scope: "module", ownerId: ID } })).toBe(0);
    expect(await prisma.moduleRecord.count({ where: { moduleId: ID } })).toBe(0);
    expect(await prisma.moduleMigration.count({ where: { moduleId: ID } })).toBe(0);
  });

  // REGRESSION (2026-07-22): installs never wrote a Module row, so enableModule recorded
  // EVERY module as source:"bundled" — putting source-installed modules inside the
  // prune's blast radius. A module that failed to load once would have had its tables and
  // all its data destroyed. Provenance is now recorded at install and the prune is guarded
  // by it (and by the files still being on disk).
  it("never purges a module whose code is still on disk, even with no install record", async () => {
    // This is the state of anything installed by v1.4.0-beta.3: row says "bundled"
    // (the old enableModule hardcoded it) and there is NO provenance file to repair from.
    // The only thing standing between it and deletion is "its files are still there".
    await enableModule(sampleDef());
    await moduleStoreApi(ID).set("k", 1);
    const entry = path.join(MODULE_DIR, "module.ts");
    fs.writeFileSync(entry, "export default {};", "utf8");
    try {
      // Definition absent from the registry — exactly what used to trigger the purge.
      await pruneRemovedBundledModules();

      expect(await prisma.module.findUnique({ where: { id: ID } })).not.toBeNull();
      expect(await tableExists("mod_testmod_notes")).toBe(true);
      expect(await prisma.moduleRecord.count({ where: { moduleId: ID } })).toBe(1);
    } finally {
      fs.rmSync(entry, { force: true });
    }
  });

  it("never purges a module that has an install record", async () => {
    await enableModule(sampleDef());
    await moduleStoreApi(ID).set("k", 1);
    writeProvenance(ID, { source: "https://github.com/someone/addons", channel: "beta", version: "1.0.0" });

    await pruneRemovedBundledModules();

    expect(await prisma.module.findUnique({ where: { id: ID } })).not.toBeNull();
    expect(await tableExists("mod_testmod_notes")).toBe(true);
  });

  it("repairs the source and channel of a row written before provenance existed", async () => {
    await enableModule(sampleDef());
    expect((await prisma.module.findUnique({ where: { id: ID } }))?.source).toBe("bundled");

    writeProvenance(ID, { source: "https://github.com/someone/addons", channel: "beta", version: "1.0.0" });
    await reconcileModuleProvenance();

    const row = await prisma.module.findUnique({ where: { id: ID } });
    expect(row?.source).toBe("https://github.com/someone/addons");
    expect(row?.channel).toBe("beta"); // per-module beta opt-in now matches where it came from
  });

  it("records source and channel from the install when first enabled", async () => {
    writeProvenance(ID, { source: "https://github.com/someone/addons", channel: "beta", version: "1.0.0" });
    await enableModule(sampleDef());

    const row = await prisma.module.findUnique({ where: { id: ID } });
    expect(row?.source).toBe("https://github.com/someone/addons");
    expect(row?.channel).toBe("beta");
  });

  it("prunes a bundled module a past build shipped, but never a source-installed one", async () => {
    await enableModule(sampleDef()); // lands as source "bundled"
    await moduleStoreApi(ID).set("k", 1);
    await prisma.module.create({
      data: { id: "from-repo", name: "From a source", version: "1.0.0", source: "repo" },
    });
    await moduleStoreApi("from-repo").set("k", 1);

    // The registry ships nothing, so the bundled row is an orphan; the repo one is not.
    await pruneRemovedBundledModules();

    expect(await prisma.module.findUnique({ where: { id: ID } })).toBeNull();
    expect(await tableExists("mod_testmod_notes")).toBe(false);
    expect(await prisma.moduleRecord.count({ where: { moduleId: ID } })).toBe(0);

    expect(await prisma.module.findUnique({ where: { id: "from-repo" } })).not.toBeNull();
    expect(await prisma.moduleRecord.count({ where: { moduleId: "from-repo" } })).toBe(1);
  });
});
