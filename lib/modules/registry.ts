import "server-only";
import { prisma } from "@/lib/db";
import type { ModuleDefinition, ModulePermission } from "./types";
import { parseGrants } from "./permissions";
import sample from "@/modules/sample/module";

/**
 * Module registry (MOD-01). The single bridge between the core and modules — the core
 * only ever reads from here, never imports a module directly, so with zero modules the
 * app is unchanged.
 *
 * Phase 1 uses a static list of bundled modules. Phase 2 replaces it with a build-time
 * codegen that scans the `modules/` folder so fetched/imported modules are discovered
 * without editing core code.
 */
const BUNDLED: ModuleDefinition[] = [sample];

export function getAllModules(): ModuleDefinition[] {
  return BUNDLED;
}

export function getModuleDef(id: string): ModuleDefinition | undefined {
  return BUNDLED.find((m) => m.id === id);
}

export type ModuleState = { def: ModuleDefinition; enabled: boolean; granted: ModulePermission[] };

/** Enabled modules joined with their granted permissions, for rendering widgets/pages. */
export async function getEnabledModules(): Promise<ModuleState[]> {
  const rows = await prisma.module.findMany({ where: { enabled: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return BUNDLED.filter((m) => byId.has(m.id)).map((m) => ({
    def: m,
    enabled: true,
    granted: parseGrants(byId.get(m.id)!.grantedPermissions),
  }));
}

/** A single module's def + installed/enabled state, or null if not a known module. */
export async function getModuleState(id: string): Promise<ModuleState | null> {
  const def = getModuleDef(id);
  if (!def) return null;
  const row = await prisma.module.findUnique({ where: { id } });
  return { def, enabled: !!row?.enabled, granted: row ? parseGrants(row.grantedPermissions) : [] };
}

/** Every bundled module + its current state, for the admin Modules list. */
export async function listModulesForAdmin(): Promise<ModuleState[]> {
  const rows = await prisma.module.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return BUNDLED.map((def) => {
    const row = byId.get(def.id);
    return { def, enabled: !!row?.enabled, granted: row ? parseGrants(row.grantedPermissions) : [] };
  });
}
