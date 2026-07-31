import "server-only";
import { getAllModules } from "@/lib/modules/registry";
import { getHelperDef } from "@/lib/helpers/registry";
import { helperIdsOf } from "@/lib/modules/types";
import { prisma } from "@/lib/db";
import { parseGrants } from "@/lib/modules/permissions";
import { describePermission } from "@/lib/modules/types";
import type { DeclaredPermission } from "@/lib/modules/types";

/**
 * The data behind Admin → Permissions (CORE-10). ⚠ Both axes come from ONE read — "which modules
 * can restart services" cannot be reconstructed module by module, and two separate queries could
 * disagree.
 * REFS app/admin/permissions/page.tsx · ui.tsx  PINS tests/unit/permissions-view.test.ts
 */

/** REFS app/admin/permissions/ui.tsx — rendered directly; `risk` drives the highlight */
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
 * What a helper says about one of its capabilities. A permission is `<helperId>:<verb>` by
 * contract, so the helper is derivable from the key. ⚠ A module may also declare a CORE permission
 * belonging to no helper, which must not be dropped just because nothing describes it.
 * REFS lib/modules/types.ts › helperIdForPermission() — the same split, authoritative
 */
function describeCapability(permission: DeclaredPermission): CapabilityInfo {
  const helperId = String(permission).split(":")[0] ?? "";
  const def = helperId ? getHelperDef(helperId) : undefined;
  const cap = def?.provides?.find((c) => c.permission === permission);

  /*
   * ⚠ Never re-derive consent text or risk here. `describePermission` is the single place it is
   * decided; this page had its own logic and immediately drifted, rating every core permission
   * "High risk" — which made the genuinely dangerous one indistinguishable from `crypto:use`.
   * REFS lib/modules/types.ts › describePermission()
   */
  const described = describePermission(permission);

  return {
    permission,
    label: cap?.label ?? described.text,
    // A helper states its own risk; otherwise take core's `dangerous`, which already means
    // "highlight this in the consent screen".
    risk: cap?.risk ?? (described.dangerous ? "high" : "low"),
    helper: def ? { id: def.id, name: def.name } : null,
    hasScope: Boolean(cap?.scope),
  };
}

/** Every module with what it declared and what it currently holds.
 *  REFS app/admin/permissions/page.tsx · capabilityHolders() below — pivots this exact data
 *  PINS tests/unit/permissions-view.test.ts */
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
 * The same data pivoted: one row per capability, every module that declares it — the axis that
 * answers "what can reach my files?". ⚠ Built from `modulePermissions()` above, never its own
 * query, so the two views cannot disagree.
 * REFS app/admin/permissions/page.tsx  PINS tests/unit/permissions-view.test.ts
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
