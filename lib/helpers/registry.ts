import "server-only";
import { prisma } from "@/lib/db";
import type { HelperDefinition } from "./types";
import { helperIdsOf } from "@/lib/modules/types";
import { resolveHelperChannel, type HelperChannelState } from "./channel";
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
  return helperIdsOf(getAllModules().find((m) => m.id === moduleId)?.helpers);
}

/** Which installed modules depend on a helper — answers "why is this here?" on the admin page. */
export function dependentsOf(helperId: string): { id: string; name: string }[] {
  return getAllModules()
    .filter((m) => helperIdsOf(m.helpers).includes(helperId))
    .map((m) => ({ id: m.id, name: m.name }));
}

/**
 * Every helper id any **installed** module depends on — regardless of whether that module is
 * switched on.
 *
 * This is the set whose **schema** must be kept current (see `bootHelpers`), because a disabled
 * module can be re-enabled at any moment and its helper must not then meet an old layout. It is
 * deliberately NOT the set that gets *started* — for that, see `activeHelperIds()`.
 */
export function allRequiredHelperIds(): Set<string> {
  const out = new Set<string>();
  for (const m of getAllModules()) for (const h of helperIdsOf(m.helpers)) out.add(h);
  return out;
}

/**
 * Every helper id an **enabled** module depends on — the set that may actually run.
 *
 * **Why this exists (add-ons session, 2026-07-27).** Until now `onBoot` ran for every *installed*
 * helper, enabled state never entering the decision. For almost every helper that is correct: a
 * helper does nothing until a module calls it, so a disabled module means a dormant helper by
 * definition.
 *
 * It stops being correct the moment a helper **holds a resource of its own** — a listening socket,
 * a watcher, a timer. The `mcp` helper is the first: switching its add-on off under Admin → Addons
 * left the endpoint open and nothing on screen said so. An admin who believed they had closed the
 * door had done nothing at all, which is the same defect class as a permission switch that doesn't
 * revoke.
 *
 * Note it counts modules that are enabled **and installed**: a module row that doesn't exist yet
 * has never been enabled, so its helper stays dormant until someone turns it on.
 */
export async function activeHelperIds(): Promise<Set<string>> {
  const { getEnabledModules } = await import("@/lib/modules/registry");
  const out = new Set<string>();
  for (const m of await getEnabledModules()) for (const h of helperIdsOf(m.def.helpers)) out.add(h);
  return out;
}

/**
 * Consent wording for every capability the INSTALLED helpers provide, keyed by permission
 * id — the roll-up that makes a helper-provided capability visible on a consent screen.
 *
 * Each label comes from the helper's own `describe(config)`, so it can name what actually
 * happens to the machine ("Read and write files in D:\Backups") rather than a capability
 * name. Reading config is best-effort: a helper that throws while describing itself must
 * not take a consent screen down, so it falls back to the permission id and
 * `describePermission` renders it as unexplained-but-flagged.
 */
export async function helperCapabilityLabels(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const h of getAllHelpers()) {
    if (!h.provides?.length) continue;

    // Ask the helper for its own config so `describe` can name real specifics. Bounded and
    // swallowed: a helper that hangs or throws while describing itself must never take a
    // consent screen down — generic wording is honest, a blank page is not.
    let config: Record<string, unknown> = {};
    if (h.readConfig) {
      config = await Promise.race([
        Promise.resolve(h.readConfig()).catch(() => ({})),
        new Promise<Record<string, unknown>>((r) => setTimeout(() => r({}), 2000)),
      ]).catch(() => ({}));
    }

    for (const cap of h.provides) {
      try {
        const text = cap.describe(config);
        if (typeof text === "string" && text.trim()) out[cap.permission] = text.trim().slice(0, 200);
      } catch {
        // Leave it unlabelled — never silently omit the permission itself.
      }
    }
  }
  return out;
}

export type HelperState = {
  def: HelperDefinition;
  installed: boolean;
  installedVersion: string | null;
  dependents: { id: string; name: string }[];
  /** Which channel it is on, why, and whether an admin pinned it (MOD-10). */
  channel: HelperChannelState;
};

/** Everything installed, with who depends on it, for the read-only admin page. */
export async function listHelpersForAdmin(): Promise<HelperState[]> {
  const rows = await prisma.helper.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: HelperState[] = [];
  for (const def of getAllHelpers()) {
    // Resolved rather than read off the row: the row is written at boot, so a module
    // moved to beta since then would otherwise show the stale channel.
    const channel = await resolveHelperChannel(def.id);
    out.push({
      def,
      installed: byId.has(def.id),
      installedVersion: byId.get(def.id)?.version ?? null,
      dependents: dependentsOf(def.id),
      channel,
    });
  }
  return out;
}
