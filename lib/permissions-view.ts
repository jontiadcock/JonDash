import "server-only";
import { getAllModules } from "@/lib/modules/registry";
import { getHelperDef } from "@/lib/helpers/registry";
import { helperIdsOf } from "@/lib/modules/types";
import { prisma } from "@/lib/db";
import { parseGrants } from "@/lib/modules/permissions";
import { describePermission } from "@/lib/modules/types";
import type { DeclaredPermission } from "@/lib/modules/types";

/**
 * The data behind Admin → Permissions (CORE-10).
 *
 * **Both axes, from one read.** *"Which modules can restart services"* is the view that catches
 * trouble, and it cannot be reconstructed by clicking through modules one at a time — so the
 * page offers by-module and by-capability over the same underlying rows rather than two
 * different queries that could disagree.
 */

export type CapabilityInfo = {
  permission: DeclaredPermission;
  /** Plain-language label, or the raw key when the helper offered none. */
  label: string;
  risk: "low" | "medium" | "high";
  /** The helper that defines it, or null for a core permission a module declares directly. */
  helper: { id: string; name: string } | null;
  /** True when this capability is bounded by an admin-owned set the page can edit. */
  hasScope: boolean;
};

export type ModulePermissions = {
  moduleId: string;
  moduleName: string;
  enabled: boolean;
  /** Declared by the module — the ceiling. A grant can only ever be a subset of this. */
  declared: CapabilityInfo[];
  /** Currently held. Absent from here but present in `declared` means "switched off". */
  granted: Set<DeclaredPermission>;
};

/** Capability-first: one row per capability, listing who holds it. */
export type CapabilityHolders = {
  capability: CapabilityInfo;
  holders: { moduleId: string; moduleName: string; granted: boolean; enabled: boolean }[];
};

/**
 * Look up what a helper says about one of its capabilities.
 *
 * A permission is `<helperId>:<verb>` by contract, so the helper is derivable from the key —
 * but a module may also declare a core permission that belongs to no helper, and that must not
 * be dropped from the page just because nothing describes it.
 */
function describeCapability(permission: DeclaredPermission): CapabilityInfo {
  const helperId = String(permission).split(":")[0] ?? "";
  const def = helperId ? getHelperDef(helperId) : undefined;
  const cap = def?.provides?.find((c) => c.permission === permission);

  // `describePermission` is documented as THE single place consent text is decided, so that no
  // surface can render a blank or disagree with another. This page went through its own logic
  // at first and immediately drifted: every core permission came out "High risk", which made
  // the genuinely dangerous one indistinguishable from `crypto:use` and defeated the point of
  // showing risk at all.
  const described = describePermission(permission);

  return {
    permission,
    label: cap?.label ?? described.text,
    // A helper states its own risk. Otherwise take core's existing judgement: `dangerous` is
    // already "highlight this in the consent screen", and a helper-provided capability core
    // never defined is dangerous by default there too.
    risk: cap?.risk ?? (described.dangerous ? "high" : "low"),
    helper: def ? { id: def.id, name: def.name } : null,
    hasScope: Boolean(cap?.scope),
  };
}

/** Every module with what it declared and what it currently holds. */
export async function modulePermissions(): Promise<ModulePermissions[]> {
  const rows = await prisma.module.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));

  return getAllModules()
    .map((def) => {
      const row = byId.get(def.id);
      return {
        moduleId: def.id,
        moduleName: def.name,
        enabled: row?.enabled ?? false,
        declared: [...new Set(def.permissions)].map(describeCapability),
        granted: new Set(row ? parseGrants(row.grantedPermissions) : []),
      };
    })
    .sort((a, b) => a.moduleName.localeCompare(b.moduleName));
}

/**
 * The same data pivoted: one row per capability, every module that declares it.
 *
 * This is the axis that answers *"what can reach my files?"* in one glance. Built from
 * `modulePermissions()` rather than its own query, so the two views cannot disagree.
 */
export async function capabilityHolders(): Promise<CapabilityHolders[]> {
  const modules = await modulePermissions();
  const map = new Map<string, CapabilityHolders>();

  for (const m of modules) {
    for (const cap of m.declared) {
      const key = String(cap.permission);
      if (!map.has(key)) map.set(key, { capability: cap, holders: [] });
      map.get(key)!.holders.push({
        moduleId: m.moduleId,
        moduleName: m.moduleName,
        granted: m.granted.has(cap.permission),
        enabled: m.enabled,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...map.values()].sort(
    (a, b) =>
      order[a.capability.risk] - order[b.capability.risk] ||
      a.capability.label.localeCompare(b.capability.label),
  );
}

/** Helpers currently required by an installed module — for the merged Modules page section. */
export function helpersInUse(): { id: string; name: string; usedBy: string[] }[] {
  const out = new Map<string, { id: string; name: string; usedBy: string[] }>();
  for (const m of getAllModules()) {
    for (const hid of helperIdsOf(m.helpers)) {
      const def = getHelperDef(hid);
      if (!def) continue;
      if (!out.has(hid)) out.set(hid, { id: def.id, name: def.name, usedBy: [] });
      out.get(hid)!.usedBy.push(m.name);
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
