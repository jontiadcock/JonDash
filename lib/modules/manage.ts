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
 * Apply migrations a module gained in an UPDATE (MOD-01, 2026-07-22).
 *
 * `runModuleMigrations` was only ever called from `enableModule`, but an update replaces
 * files while the module is already enabled — so enable never runs again and a version
 * shipping `002_add_column.sql` would run new code against the old schema. Nothing would
 * warn; the module would simply misbehave.
 *
 * Keyed on the `migratedVersion` column that already exists. Only files not recorded in
 * `ModuleMigration` actually run, so this is idempotent and it self-heals modules that
 * were updated before this existed. It must run AFTER the rebuild+restart, because the
 * new definition isn't loadable until then — hence lazily, on the first registry read of
 * a fresh process, rather than at the moment of updating.
 *
 * One module failing must not stop the others, or block the page that triggered this.
 */
let migrationSync: Promise<void> | null = null;

export function ensureModuleMigrations(): Promise<void> {
  // Once per process, and concurrent callers share the same run rather than racing.
  migrationSync ??= (async () => {
    try {
      const rows = await prisma.module.findMany({
        where: { enabled: true },
        select: { id: true, migratedVersion: true },
      });
      for (const row of rows) {
        const def = getAllModules().find((m) => m.id === row.id);
        if (!def || row.migratedVersion === def.version) continue;
        try {
          await runModuleMigrations(def);
          await prisma.module.updateMany({ where: { id: def.id }, data: { migratedVersion: def.version } });
        } catch (e) {
          // Leave migratedVersion alone so it's retried next boot rather than skipped.
          console.error(`[modules] migrations failed for "${def.id}":`, e);
        }
      }
    } catch (e) {
      console.error("[modules] migration sync failed:", e);
    }
  })();
  return migrationSync;
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
