import type { ModuleDefinition, ModulePermission } from "./types";

/**
 * Module permission grants (MOD-01). Consent is all-or-nothing: the admin reviews the
 * permissions a module declares and approves them by enabling it. These helpers just
 * normalize the stored grant list.
 */

/** The permissions granted when a module is enabled (its declared set, de-duped). */
export function grantsForModule(def: ModuleDefinition): ModulePermission[] {
  return [...new Set(def.permissions)];
}

/** Parse the JSON grant list stored on the Module row. */
export function parseGrants(json: string): ModulePermission[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as ModulePermission[]) : [];
  } catch {
    return [];
  }
}
