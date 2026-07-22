import "server-only";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "./types";
import { runModuleMigrations, dropModuleTables } from "./migrate";
import { purgeModuleData } from "./store";
import { buildModuleContext } from "./context";
import { grantsForModule, parseGrants } from "./permissions";
import { getAllModules } from "./registry";
import { readProvenance, installedModuleIds } from "./provenance";
import { moduleFilesExist } from "./install";

/**
 * Module lifecycle (MOD-01). Enable = run its migrations + record it enabled with the
 * granted permissions + fire onEnable. Disable = flip off (data kept). Uninstall =
 * drop its `mod_<id>_*` tables + purge its settings/store/records so it leaves no trace.
 * Takes a ModuleDefinition (resolved from the registry by the caller) so this stays
 * free of any specific module import — and unit-testable with a fake definition.
 */

export async function enableModule(def: ModuleDefinition): Promise<void> {
  const granted = grantsForModule(def);
  await runModuleMigrations(def); // create mod_<id>_* tables before onEnable runs
  // Where it came from is only knowable from the install record — a ModuleDefinition
  // says nothing about its repo or channel. Applied on UPDATE too, so a row written by
  // an older build (which assumed "bundled") is corrected the next time it's enabled.
  const prov = readProvenance(def.id);
  await prisma.module.upsert({
    where: { id: def.id },
    create: {
      id: def.id,
      name: def.name,
      version: def.version,
      enabled: true,
      source: prov?.source ?? "bundled",
      channel: prov?.channel ?? "stable",
      grantedPermissions: JSON.stringify(granted),
      migratedVersion: def.version,
    },
    update: {
      name: def.name,
      version: def.version,
      enabled: true,
      ...(prov ? { source: prov.source } : {}),
      grantedPermissions: JSON.stringify(granted),
      migratedVersion: def.version,
    },
  });
  if (def.onEnable) await def.onEnable(buildModuleContext(def, granted, null));
}

export async function disableModule(def: ModuleDefinition): Promise<void> {
  const row = await prisma.module.findUnique({ where: { id: def.id } });
  await prisma.module.updateMany({ where: { id: def.id }, data: { enabled: false } });
  if (def.onDisable) {
    await def.onDisable(buildModuleContext(def, row ? parseGrants(row.grantedPermissions) : [], null));
  }
}

export async function uninstallModule(def: ModuleDefinition): Promise<void> {
  if (def.onUninstall) await def.onUninstall(buildModuleContext(def, [], null));
  await dropModuleTables(def.id); // drop mod_<id>_* + migration records
  await purgeModuleData(def.id); // settings + generic store
  await prisma.module.deleteMany({ where: { id: def.id } });
}

/**
 * Repair rows whose provenance was lost. Builds before this fix recorded EVERY module as
 * `source: "bundled"` (enableModule had no install record to consult), which broke the
 * per-module beta channel and — far worse — put source-installed modules inside the
 * blast radius of the prune below. Runs wherever the prune does, so an existing install
 * corrects itself without the admin doing anything.
 */
export async function reconcileModuleProvenance(): Promise<void> {
  for (const id of installedModuleIds()) {
    const prov = readProvenance(id);
    if (!prov) continue;
    const row = await prisma.module.findUnique({ where: { id }, select: { source: true, channel: true } });
    if (!row) continue;
    if (row.source === prov.source && row.channel === prov.channel) continue;
    await prisma.module.updateMany({
      where: { id },
      // The channel the admin chose later is authoritative; only fix the default.
      data: { source: prov.source, ...(row.channel === "stable" ? { channel: prov.channel } : {}) },
    });
  }
}

/**
 * Clear the DB traces of a module that shipped WITH a previous build and no longer
 * exists (e.g. the old `sample`), so an upgraded install isn't left with an orphan row
 * and stray `mod_<id>_*` tables.
 *
 * THIS DELETES USER DATA, so it is guarded three ways: only `source: "bundled"` rows are
 * considered, and a module is skipped if it has an install record OR its files are still
 * on disk. That last guard is the important one — a definition failing to load is a BUILD
 * problem (a bad rebuild, a module dropped from generated.ts), not evidence the module
 * was removed, and purging on that basis would destroy everything the module owns.
 */
export async function pruneRemovedBundledModules(): Promise<void> {
  await reconcileModuleProvenance();

  const known = new Set(getAllModules().map((m) => m.id));
  const rows = await prisma.module.findMany({ where: { source: "bundled" }, select: { id: true } });
  for (const { id } of rows) {
    if (known.has(id)) continue; // still shipped by this build
    if (readProvenance(id)) continue; // was installed, not bundled — never auto-purge
    if (moduleFilesExist(id)) continue; // code is still there; it just didn't load
    await dropModuleTables(id);
    await purgeModuleData(id);
    await prisma.module.deleteMany({ where: { id } });
  }
}
