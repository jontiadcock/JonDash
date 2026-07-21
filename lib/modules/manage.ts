import "server-only";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "./types";
import { runModuleMigrations, dropModuleTables } from "./migrate";
import { purgeModuleData } from "./store";
import { buildModuleContext } from "./context";
import { grantsForModule, parseGrants } from "./permissions";

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
  await prisma.module.upsert({
    where: { id: def.id },
    create: {
      id: def.id,
      name: def.name,
      version: def.version,
      enabled: true,
      source: "bundled",
      grantedPermissions: JSON.stringify(granted),
      migratedVersion: def.version,
    },
    update: {
      name: def.name,
      version: def.version,
      enabled: true,
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
