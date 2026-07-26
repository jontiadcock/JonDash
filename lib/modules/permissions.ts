import type { DeclaredPermission, ModuleDefinition } from "./types";

/**
 * Module permission grants (MOD-01). Consent is all-or-nothing: the admin reviews the
 * permissions a module declares and approves them by enabling it. These helpers just
 * normalize the stored grant list.
 */

/** The permissions granted when a module is enabled (its declared set, de-duped). */
export function grantsForModule(def: ModuleDefinition): DeclaredPermission[] {
  return [...new Set(def.permissions)];
}

/**
 * Turn one capability on or off for one module (CORE-10).
 *
 * **Per (module, capability), never per helper.** A helper-level switch would silently widen
 * every module that declared that helper — including ones installed earlier for unrelated
 * reasons. The helper's own configuration is the ceiling; this is each module's grant inside it.
 *
 * **Enforcement is free.** `ctx.can()` and `ctx.grants` already read the STORED list
 * (`registry.ts` → `parseGrants(row.grantedPermissions)`), not the declared one — so removing a
 * capability here takes effect everywhere the next time a context is built, with no change to
 * any call site. What did not exist before was any way to store a subset: consent was
 * all-or-nothing at enable time.
 *
 * A capability the module never declared cannot be granted. The declared set stays the ceiling;
 * this only ever narrows within it, so a tampered form cannot widen a module beyond what its
 * consent screen showed.
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
export function parseGrants(json: string): DeclaredPermission[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as DeclaredPermission[]) : [];
  } catch {
    return [];
  }
}
