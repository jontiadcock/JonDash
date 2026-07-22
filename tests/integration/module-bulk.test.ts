import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "@/lib/modules/types";
import { enableModule, uninstallModule } from "@/lib/modules/manage";
import { moduleStoreApi } from "@/lib/modules/store";
import { removeModuleFiles, moduleFilesExist } from "@/lib/modules/install";
import { writeProvenance, readProvenance } from "@/lib/modules/provenance";
import { dropModuleTables } from "@/lib/modules/migrate";

/**
 * Bulk uninstall: removing several modules must cost ONE rebuild + restart, so the
 * action loops over every id and only then hands over to the launcher. Each module's
 * data, files and install record must all be gone — a partial removal would leave the
 * registry pointing at code that isn't there, which is what bricks a build.
 */
const IDS = ["bulkone", "bulktwo", "bulkthree"];
const MODULES_DIR = path.join(process.cwd(), "modules");
const DATA_DIR = path.join(process.cwd(), ".data-test-bulk");
let prevDataDir: string | undefined;

function def(id: string): ModuleDefinition {
  return {
    id,
    name: `Bulk ${id}`,
    description: "test",
    version: "1.0.0",
    minAppVersion: "1.4.0",
    permissions: [],
  };
}

/** Lay a module on disk the way an install would, so removal is genuinely exercised. */
function layDown(id: string) {
  fs.mkdirSync(path.join(MODULES_DIR, id), { recursive: true });
  fs.writeFileSync(path.join(MODULES_DIR, id, "module.ts"), "export default {};", "utf8");
  writeProvenance(id, { source: "https://github.com/x/y", channel: "beta", version: "1.0.0" });
}

async function cleanup() {
  for (const id of IDS) {
    await dropModuleTables(id).catch(() => {});
    fs.rmSync(path.join(MODULES_DIR, id), { recursive: true, force: true });
  }
  await prisma.moduleRecord.deleteMany();
  await prisma.module.deleteMany();
  await prisma.setting.deleteMany({ where: { scope: "module" } });
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  prevDataDir ??= process.env.JONDASH_DATA_DIR;
  process.env.JONDASH_DATA_DIR = DATA_DIR;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (prevDataDir === undefined) delete process.env.JONDASH_DATA_DIR;
  else process.env.JONDASH_DATA_DIR = prevDataDir;
  await prisma.$disconnect();
});

describe("bulk module uninstall", () => {
  it("removes every selected module completely in one pass", async () => {
    for (const id of IDS) {
      layDown(id);
      await enableModule(def(id));
      await moduleStoreApi(id).set("k", 1);
    }
    expect(await prisma.module.count()).toBe(3);

    // What uninstallModuleAction does for each selected id before the single rebuild.
    for (const id of IDS) {
      await uninstallModule(def(id));
      removeModuleFiles(id);
    }

    for (const id of IDS) {
      expect(await prisma.module.findUnique({ where: { id } }), id).toBeNull();
      expect(await prisma.moduleRecord.count({ where: { moduleId: id } }), id).toBe(0);
      expect(moduleFilesExist(id), id).toBe(false);
      expect(readProvenance(id), id).toBeNull(); // install record cleared too
    }
  });

  it("removing a subset leaves the others untouched", async () => {
    for (const id of IDS) {
      layDown(id);
      await enableModule(def(id));
      await moduleStoreApi(id).set("k", 1);
    }

    await uninstallModule(def("bulkone"));
    removeModuleFiles("bulkone");
    await uninstallModule(def("bulkthree"));
    removeModuleFiles("bulkthree");

    expect(await prisma.module.findUnique({ where: { id: "bulkone" } })).toBeNull();
    expect(await prisma.module.findUnique({ where: { id: "bulkthree" } })).toBeNull();

    const kept = await prisma.module.findUnique({ where: { id: "bulktwo" } });
    expect(kept).not.toBeNull();
    expect(moduleFilesExist("bulktwo")).toBe(true);
    expect(readProvenance("bulktwo")).not.toBeNull();
    expect(await prisma.moduleRecord.count({ where: { moduleId: "bulktwo" } })).toBe(1);
  });

  it("is safe when a selected module was already removed", async () => {
    layDown("bulkone");
    await enableModule(def("bulkone"));

    await uninstallModule(def("bulkone"));
    removeModuleFiles("bulkone");
    // Same id again — a stale form, or two admins acting at once.
    await expect(uninstallModule(def("bulkone"))).resolves.not.toThrow();
    expect(() => removeModuleFiles("bulkone")).not.toThrow();
  });
});
