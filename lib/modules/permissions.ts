import type { DeclaredPermission, ModuleDefinition } from "./types";

/**
 * Module permission grants (MOD-01). Consent is all-or-nothing: the admin reviews the
 * permissions a module declares and approves them by enabling it. These helpers just
 * normalize the stored grant list.
 */

/** The permissions granted when a module is enabled (its declared set, de-duped). */
/** REFS lib/modules/manage.ts › enableModule() — the intersect that keeps a revocation revoked. */
export function grantsForModule(def: ModuleDefinition): DeclaredPermission[] {
  return [...new Set(def.permissions)];
}

/**
 * Turn one capability on or off for one module (CORE-10).
 *
 * ⚠ **Per (module, capability), never per helper.** A helper-level switch would silently widen
 *   every module that declared it, including ones installed earlier for unrelated reasons.
 * ⚠ **This only ever narrows.** The declared set is the ceiling, so a tampered form cannot widen a
 *   module beyond what its consent screen showed.
 *
 * Enforcement is free: `ctx.can()` and `ctx.grants` already read the STORED list, so removing a
 * capability takes effect the next time a context is built, with no call site changing.
 *
 * REFS lib/modules/registry.ts › parseGrants() — reads the stored list
 *      lib/modules/context.ts — builds the ctx from it · app/admin/permissions/actions.ts — the UI
 */
export function nextGrants(
  def: ModuleDefinition,
  current: DeclaredPermission[],
  permission: DeclaredPermission,
  granted: boolean,
): DeclaredPermission[] | null {
  const declared = new Set(grantsForModule(def));
  if (!declared.has(permission)) return null; // not this module's to hold

  const next = new Set(current.filter((p) => declared.has(p)));
  if (granted) next.add(permission);
  else next.delete(permission);
  return [...next];
}

/** Parse the JSON grant list stored on the Module row. */
/**
 * REFS lib/modules/registry.ts · lib/modules/context.ts — the enforcement path ·
 *      lib/permissions-view.ts · app/admin/permissions/actions.ts — the admin view
 */
export function parseGrants(json: string): DeclaredPermission[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as DeclaredPermission[]) : [];
  } catch {
    return [];
  }
}
