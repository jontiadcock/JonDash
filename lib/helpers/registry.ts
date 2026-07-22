import "server-only";
import { prisma } from "@/lib/db";
import type { HelperDefinition } from "./types";
import { INSTALLED_HELPERS } from "./generated";
import { getAllModules } from "@/lib/modules/registry";

/**
 * Helper registry (MOD-08) — the mirror of the module registry, and the only bridge
 * between core and helper code. Populated by codegen from the `helpers/` folder, so
 * installing one never needs a core edit.
 */

export function getAllHelpers(): HelperDefinition[] {
  return INSTALLED_HELPERS;
}

export function getHelperDef(id: string): HelperDefinition | undefined {
  return INSTALLED_HELPERS.find((h) => h.id === id);
}

/** Helper ids a module declared it needs. */
export function helpersRequiredBy(moduleId: string): string[] {
  return getAllModules().find((m) => m.id === moduleId)?.helpers ?? [];
}

/** Which installed modules depend on a helper — answers "why is this here?" on the admin page. */
export function dependentsOf(helperId: string): { id: string; name: string }[] {
  return getAllModules()
    .filter((m) => (m.helpers ?? []).includes(helperId))
    .map((m) => ({ id: m.id, name: m.name }));
}

/** Every helper id any installed module depends on. */
export function allRequiredHelperIds(): Set<string> {
  const out = new Set<string>();
  for (const m of getAllModules()) for (const h of m.helpers ?? []) out.add(h);
  return out;
}

export type HelperState = {
  def: HelperDefinition;
  installed: boolean;
  installedVersion: string | null;
  dependents: { id: string; name: string }[];
};

/** Everything installed, with who depends on it, for the read-only admin page. */
export async function listHelpersForAdmin(): Promise<HelperState[]> {
  const rows = await prisma.helper.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return getAllHelpers().map((def) => ({
    def,
    installed: byId.has(def.id),
    installedVersion: byId.get(def.id)?.version ?? null,
    dependents: dependentsOf(def.id),
  }));
}
