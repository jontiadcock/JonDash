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

/*
 * Module lifecycle (MOD-01). Enable runs migrations, records the granted permissions and fires
 * `onEnable`; disable flips it off and keeps the data; uninstall drops the module's tables and
 * purges its settings, store and records. Takes a `ModuleDefinition` resolved by the caller, so
 * this file imports no specific module and is testable with a fake one.
 *
 * REFS app/admin/modules/actions.ts — the admin entry point for all three
 *      lib/modules/rebuild.ts — the rebuild that makes an install or removal real
 * PINS tests/integration/modules.test.ts · tests/integration/module-bulk.test.ts
 */

export async function enableModule(def: ModuleDefinition): Promise<void> {
  const declared = grantsForModule(def);

  /*
   * ⚠ **A revoked capability must STAY revoked** (BUG-56). Writing the full declared set on every
   *   enable meant a disable/enable round trip silently restored everything the admin turned off.
   *
   * First enable takes the declared set — that is what the consent screen showed. Every later
   * enable **intersects**: keep what the admin has, drop what the new version no longer declares,
   * add nothing. A permission new in an update has its own consent gate; adding here is not this
   * function's job. REFS app/admin/permissions/ — where a revocation is made
   */
  const existing = await prisma.module.findUnique({
    where: { id: def.id },
    select: { grantedPermissions: true },
  });
  const current = existing ? parseGrants(existing.grantedPermissions) : null;
  const granted = current ? declared.filter((p) => current.includes(p)) : declared;

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

export async function uninstallModule(
  def: ModuleDefinition,
  /** Replies to the module's `uninstallQuestions`, keyed by question id. */
  answers: Record<string, boolean> = {},
): Promise<void> {
  if (def.onUninstall) await def.onUninstall(buildModuleContext(def, [], null), answers);
  await dropModuleTables(def.id); // drop mod_<id>_* + migration records
  await purgeModuleData(def.id); // settings + generic store
  await prisma.module.deleteMany({ where: { id: def.id } });
}

/**
 * Apply migrations a module gained in an UPDATE. An update replaces files while the module is
 * already enabled, so `enableModule` never runs again and a new `002_add_column.sql` would leave
 * new code running against the old schema, with nothing warning.
 *
 * Idempotent — only files absent from `ModuleMigration` run — so it self-heals modules updated
 * before this existed. ⚠ Must run AFTER the rebuild and restart, because the new definition is not
 * loadable until then; hence lazily, on the first registry read of a fresh process. One module
 * failing must not stop the others or block the page.
 *
 * REFS lib/modules/migrate.ts — runs the files · app/(app)/dashboard/page.tsx ·
 *      app/(app)/m/[module]/[[...path]]/page.tsx · app/admin/modules/page.tsx · lib/helpers/boot.ts
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
 * Repair rows whose provenance was lost. Older builds recorded every module as `source: "bundled"`,
 * which broke the per-module beta channel and — worse — put source-installed modules inside the
 * blast radius of the prune below. Runs wherever the prune does, so an install corrects itself.
 *
 * REFS lib/modules/provenance.ts — what a correct row looks like
 * PINS tests/integration/modules.test.ts
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
 * Clear the DB traces of a module that shipped with a previous build and no longer exists, so an
 * upgraded install is not left with an orphan row and stray tables.
 *
 * ⚠ **THIS DELETES USER DATA.** Guarded three ways: only `source: "bundled"` rows are considered,
 *   and a module is skipped if it has an install record OR its files are on disk. That last guard
 *   is the important one — a definition failing to load is a BUILD problem, not evidence of
 *   removal, and purging on that basis destroys everything the module owns.
 * REFS app/admin/modules/page.tsx · lib/modules/provenance.ts — the callers
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
