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

/**
 * REFS 10 callers — `git grep -l -w getAllModules -- app lib`
 * PINS tests/integration/helper-channel.test.ts · tests/integration/helper-reconcile.test.ts
 *      tests/integration/module-updates.test.ts · tests/unit/helper-resolution.test.ts
 */
export function getAllModules(): ModuleDefinition[] {
  return BUNDLED;
}

/**
 * REFS app/admin/modules/actions.ts · app/admin/permissions/actions.ts · lib/modules/install.ts
 *      lib/uninstall-questions.ts
 */
export function getModuleDef(id: string): ModuleDefinition | undefined {
  return BUNDLED.find((m) => m.id === id);
}

/** REFS 15 callers — `git grep -l -w ModuleChannel -- app lib` */
export type ModuleChannel = "stable" | "beta";

export type ModuleState = {
  def: ModuleDefinition;
  enabled: boolean;
  granted: DeclaredPermission[];
  /** Per-module release channel (which channel its updates come from). */
  channel: ModuleChannel;
  /** Whether a Module row exists (installed/known to the DB) at all. */
  installed: boolean;
  /** Opt-in automatic updates for THIS module (MOD-10). Off unless deliberately set. */
  autoUpdate: boolean;
};

function channelOf(row: { channel: string } | null | undefined): ModuleChannel {
  return row?.channel === "beta" ? "beta" : "stable";
}

/** Enabled modules joined with their granted permissions, for rendering widgets/pages. */
/**
 * REFS app/(app)/dashboard/page.tsx · lib/helpers/registry.ts
 * PINS tests/unit/service-accounts.test.ts
 */
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
      autoUpdate: row?.autoUpdate === true,
      installed: true,
    };
  });
}

/** A single module's def + installed/enabled state, or null if not a known module. */
/**
 * REFS app/(app)/m/[module]/[[...path]]/page.tsx · app/admin/modules/[id]/page.tsx
 *      lib/modules/actions.ts · lib/modules/context.ts
 */
export async function getModuleState(id: string): Promise<ModuleState | null> {
  const def = getModuleDef(id);
  if (!def) return null;
  const row = await prisma.module.findUnique({ where: { id } });
  return {
    def,
    enabled: !!row?.enabled,
    granted: row ? parseGrants(row.grantedPermissions) : [],
    channel: channelOf(row),
      autoUpdate: row?.autoUpdate === true,
    installed: !!row,
  };
}

/** Every bundled module + its current state, for the admin Modules list. */
/** REFS app/admin/modules/page.tsx */
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
      autoUpdate: row?.autoUpdate === true,
      installed: !!row,
    };
  });
}
