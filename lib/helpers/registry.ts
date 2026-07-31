import "server-only";
import { prisma } from "@/lib/db";
import type { HelperDefinition } from "./types";
import { helperIdsOf } from "@/lib/modules/types";
import { resolveHelperChannel, type HelperChannelState } from "./channel";
import { INSTALLED_HELPERS } from "./generated";
import { getAllModules } from "@/lib/modules/registry";

/*
 * Helper registry (MOD-08) — the only bridge between core and helper code, generated from the
 * `helpers/` folder so installing one never needs a core edit.
 *
 * REFS scripts/gen-module-registry.mjs — writes generated.ts · lib/helpers/types.ts — the contract
 */

/** REFS lib/backup-addons.ts · lib/helpers/boot.ts · lib/helpers/updates.ts */
export function getAllHelpers(): HelperDefinition[] {
  return INSTALLED_HELPERS;
}

/**
 * REFS app/admin/helpers/actions.ts · app/admin/permissions/actions.ts · lib/helpers/install.ts ·
 *      lib/permissions-view.ts · lib/uninstall-questions.ts
 */
export function getHelperDef(id: string): HelperDefinition | undefined {
  return INSTALLED_HELPERS.find((h) => h.id === id);
}

/** Helper ids a module declared it needs. */
export function helpersRequiredBy(moduleId: string): string[] {
  return helperIdsOf(getAllModules().find((m) => m.id === moduleId)?.helpers);
}

/** Which installed modules depend on a helper — answers "why is this here?" on the admin page. */
/** REFS lib/updates/auto-run.ts — decides whether a helper update is safe to apply. */
export function dependentsOf(helperId: string): { id: string; name: string }[] {
  return getAllModules()
    .filter((m) => helperIdsOf(m.helpers).includes(helperId))
    .map((m) => ({ id: m.id, name: m.name }));
}

/**
 * Every helper id any **installed** module depends on, enabled or not — the set whose **schema** is
 * kept current, because a disabled module can be re-enabled at any moment.
 *
 * ⚠ NOT the set that gets *started*. REFS activeHelperIds() below · lib/helpers/boot.ts
 */
export function allRequiredHelperIds(): Set<string> {
  const out = new Set<string>();
  for (const m of getAllModules()) for (const h of helperIdsOf(m.helpers)) out.add(h);
  return out;
}

/**
 * Every helper id an **enabled** module depends on — the set that may actually run.
 *
 * ⚠ A helper that **holds a resource** — a listening socket, a watcher, a timer — must not keep it
 *   while its add-on is switched off. Otherwise an admin who believed they closed the door did
 *   nothing at all: the same defect class as a permission switch that does not revoke.
 *
 * Counts modules enabled **and** installed: a row that does not exist has never been enabled.
 * REFS lib/helpers/boot.ts — the only consumer; decides which helpers get `onBoot`
 */
export async function activeHelperIds(): Promise<Set<string>> {
  const { getEnabledModules } = await import("@/lib/modules/registry");
  const out = new Set<string>();
  for (const m of await getEnabledModules()) for (const h of helperIdsOf(m.def.helpers)) out.add(h);
  return out;
}

/**
 * Consent wording for every capability the installed helpers provide — the roll-up that makes a
 * helper-provided capability visible on a consent screen. Each label comes from the helper's own
 * `describe(config)`, so it names what happens to the machine rather than a capability name.
 *
 * ⚠ Best-effort: a helper that throws while describing itself must not take a consent screen down,
 *   so it falls back to the permission id and renders as unexplained-but-flagged.
 * REFS lib/modules/types.ts › describePermission() — the fallback · app/admin/modules/page.tsx ·
 *      app/admin/updates/page.tsx — the consent surfaces
 */
export async function helperCapabilityLabels(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const h of getAllHelpers()) {
    if (!h.provides?.length) continue;

    // ⚠ Bounded and swallowed: a helper that hangs while describing itself must not take a consent
    // screen down — generic wording is honest, a blank page is not.
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
/** REFS app/admin/modules/shared-capabilities.tsx — the read-only Shared capabilities list. */
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
