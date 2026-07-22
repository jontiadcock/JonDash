import "server-only";
import { prisma } from "@/lib/db";
import type { DeclaredPermission, ModuleDefinition } from "./types";
import { parseGrants } from "./permissions";
import { INSTALLED } from "./generated";

/**
 * Module registry (MOD-01). The single bridge between the core and modules — the core
 * only ever reads from here, never imports a module directly, so with zero modules the
 * app is unchanged.
 *
 * The list comes from `generated.ts`, which `scripts/gen-module-registry.mjs` rebuilds
 * from the `modules/` folder before every build and after any install/uninstall — so
 * installing a module never needs a core edit. JonDash ships none of its own, so a stock
 * install starts empty.
 */
const BUNDLED: ModuleDefinition[] = INSTALLED;

export function getAllModules(): ModuleDefinition[] {
  return BUNDLED;
}

export function getModuleDef(id: string): ModuleDefinition | undefined {
  return BUNDLED.find((m) => m.id === id);
}

export type ModuleChannel = "stable" | "beta";

export type ModuleState = {
  def: ModuleDefinition;
  enabled: boolean;
  granted: DeclaredPermission[];
  /** Per-module release channel (which channel its updates come from). */
  channel: ModuleChannel;
  /** Whether a Module row exists (installed/known to the DB) at all. */
  installed: boolean;
};

function channelOf(row: { channel: string } | null | undefined): ModuleChannel {
  return row?.channel === "beta" ? "beta" : "stable";
}

/** Enabled modules joined with their granted permissions, for rendering widgets/pages. */
export async function getEnabledModules(): Promise<ModuleState[]> {
  const rows = await prisma.module.findMany({ where: { enabled: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return BUNDLED.filter((m) => byId.has(m.id)).map((m) => {
    const row = byId.get(m.id)!;
    return {
      def: m,
      enabled: true,
      granted: parseGrants(row.grantedPermissions),
      channel: channelOf(row),
      installed: true,
    };
  });
}

/** A single module's def + installed/enabled state, or null if not a known module. */
export async function getModuleState(id: string): Promise<ModuleState | null> {
  const def = getModuleDef(id);
  if (!def) return null;
  const row = await prisma.module.findUnique({ where: { id } });
  return {
    def,
    enabled: !!row?.enabled,
    granted: row ? parseGrants(row.grantedPermissions) : [],
    channel: channelOf(row),
    installed: !!row,
  };
}

/** Every bundled module + its current state, for the admin Modules list. */
export async function listModulesForAdmin(): Promise<ModuleState[]> {
  const rows = await prisma.module.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return BUNDLED.map((def) => {
    const row = byId.get(def.id);
    return {
      def,
      enabled: !!row?.enabled,
      granted: row ? parseGrants(row.grantedPermissions) : [],
      channel: channelOf(row),
      installed: !!row,
    };
  });
}
