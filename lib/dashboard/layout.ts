import "server-only";
import { prisma } from "@/lib/db";

/**
 * Per-user dashboard layout, for module widgets AND service tiles alike (CORE-11), stored
 * separately per device profile (CORE-12).
 *
 * ⚠ Per-user table rather than each item's own `sortOrder`: a `Link` carrying a `roleId` belongs
 * to a service group and is visible to every member, so writing one user's arrangement into
 * `Link.sortOrder` would silently reorder that tile for all of them.
 *
 * A user with no saved row gets the default size, ordered after everything that has one.
 *
 * REFS prisma/schema.prisma › DashboardLayout — the table every function here reads and writes
 *      app/(app)/dashboard/page.tsx — reads · layout-actions.ts — writes
 * PINS tests/integration/module-rbac.test.ts
 */

/*
 * The geometry lives in `./geometry`, deliberately NOT server-only — the grid is a client component
 * needing the same numbers. Re-exported so server callers keep importing from the one place.
 */
export {
  PROFILES,
  isProfile,
  GEOMETRY,
  DEFAULT_SPAN,
  MAX_HEIGHT,
  MAX_ROWS,
  MIN_SPAN,
  itemKey,
  overlaps,
  packLayout,
  type DashboardKind,
  type DashboardProfile,
  type Placement,
} from "./geometry";

import {
  DEFAULT_SPAN,
  GEOMETRY,
  MAX_HEIGHT,
  MAX_ROWS,
  itemKey,
  type DashboardKind,
  type DashboardProfile,
} from "./geometry";

/** One saved row. REFS prisma/schema.prisma › DashboardLayout — the columns must stay in step. */
export type LayoutEntry = {
  kind: DashboardKind;
  refId: string;
  width: number;
  height: number;
  sortOrder: number;
  /** Explicit grid cell, or null to be packed into the first free space. Always both or neither. */
  col: number | null;
  row: number | null;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(Math.round(n), min), max);
}

/** A user's saved layout for one profile, keyed by `kind:refId`.
 *  REFS app/(app)/dashboard/page.tsx — the read path · placeItems() below, for previous spans
 *  PINS tests/integration/module-rbac.test.ts */
export async function getUserLayout(
  userId: string,
  profile: DashboardProfile,
): Promise<Map<string, LayoutEntry>> {
  const rows = await prisma.dashboardLayout.findMany({
    where: { userId, profile },
    select: { kind: true, refId: true, width: true, height: true, sortOrder: true, col: true, row: true },
  });
  return new Map(
    rows
      .filter((r): r is typeof r & { kind: DashboardKind } => r.kind === "module" || r.kind === "link")
      .map((r) => [itemKey(r.kind, r.refId), r]),
  );
}

/**
 * Order dashboard items: saved rows first by `sortOrder`, then anything unsaved in its natural
 * order. Items are `{kind, id}` so tiles and widgets sort against each other in ONE sequence,
 * which is the whole point of CORE-11.
 *
 * REFS app/(app)/dashboard/page.tsx — the only caller
 * PINS tests/integration/module-rbac.test.ts
 */
export function applyLayoutOrder<T extends { kind: DashboardKind; id: string }>(
  items: T[],
  layout: Map<string, LayoutEntry>,
): T[] {
  return [...items].sort((a, b) => {
    const la = layout.get(itemKey(a.kind, a.id));
    const lb = layout.get(itemKey(b.kind, b.id));
    if (la && lb) return la.sortOrder - lb.sortOrder;
    if (la) return -1; // positioned items come before unpositioned ones
    if (lb) return 1;
    return 0;
  });
}

/** The span to render for an item — its saved one, or the default for its kind.
 *  REFS lib/dashboard/geometry.ts › DEFAULT_SPAN
 *       app/(app)/dashboard/page.tsx — the only caller */
export function spanFor(
  kind: DashboardKind,
  refId: string,
  profile: DashboardProfile,
  layout: Map<string, LayoutEntry>,
): { width: number; height: number } {
  const saved = layout.get(itemKey(kind, refId));
  if (saved) return { width: saved.width, height: saved.height };
  return DEFAULT_SPAN[profile][kind];
}

/** Resize one item, for one user, in one profile. Clamped to the profile's columns and MAX_HEIGHT.
 *  REFS app/(app)/dashboard/layout-actions.ts › setItemSizeAction() — the only caller
 *  PINS tests/integration/module-rbac.test.ts */
export async function setItemSize(
  userId: string,
  kind: DashboardKind,
  refId: string,
  profile: DashboardProfile,
  width: number,
  height: number,
): Promise<void> {
  const w = clamp(width, 1, GEOMETRY[profile].columns);
  const h = clamp(height, 1, MAX_HEIGHT);
  await prisma.dashboardLayout.upsert({
    where: { userId_profile_kind_refId: { userId, profile, kind, refId } },
    create: { userId, profile, kind, refId, width: w, height: h, sortOrder: await nextSortOrder(userId, profile) },
    update: { width: w, height: h },
  });
}

async function nextSortOrder(userId: string, profile: DashboardProfile): Promise<number> {
  const last = await prisma.dashboardLayout.findFirst({
    where: { userId, profile },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

/**
 * Persist an explicit cell for every visible item, in one profile.
 *
 * ⚠ Writes the WHOLE arrangement, not just the item that moved. Most items have no stored position
 * until somebody drags something, so writing only the moved one leaves the rest free to shuffle
 * next time anything is added or removed.
 *
 * ⚠ `placements` comes from the browser: clamped here, but the CALLER must have filtered it to
 * items this user may see. This function does not check.
 * REFS app/(app)/dashboard/layout-actions.ts › placeItemsAction() — where that filtering happens
 * PINS tests/integration/module-rbac.test.ts
 */
export async function placeItems(
  userId: string,
  profile: DashboardProfile,
  placements: { kind: DashboardKind; id: string; col: number; row: number }[],
): Promise<void> {
  if (placements.length === 0) return;
  const columns = GEOMETRY[profile].columns;
  const existing = await getUserLayout(userId, profile);

  await prisma.$transaction(
    placements.map((item, index) => {
      const prev = existing.get(itemKey(item.kind, item.id));
      const fallback = DEFAULT_SPAN[profile][item.kind];
      const width = prev?.width ?? fallback.width;
      const height = prev?.height ?? fallback.height;
      // A column is bounded by the grid; a row is not — empty space below the last item is a
      // legitimate destination. MAX_ROWS only stops a corrupt value rendering thousands of rows.
      const col = clamp(item.col, 0, Math.max(0, columns - width));
      const row = clamp(item.row, 0, MAX_ROWS);
      return prisma.dashboardLayout.upsert({
        where: { userId_profile_kind_refId: { userId, profile, kind: item.kind, refId: item.id } },
        create: { userId, profile, kind: item.kind, refId: item.id, width, height, sortOrder: index, col, row },
        update: { col, row, sortOrder: index },
      });
    }),
  );
}

/** Forget a user's customisation for one item, in one profile. No caller since the Reset button
 *  went — kept as the API to re-expose.  PINS tests/integration/module-rbac.test.ts */
export async function resetItem(
  userId: string,
  kind: DashboardKind,
  refId: string,
  profile: DashboardProfile,
): Promise<void> {
  await prisma.dashboardLayout.deleteMany({ where: { userId, kind, refId, profile } });
}

/** Forget the whole arrangement for one profile — "reset my phone layout". Every item then falls
 *  back to the packed default order and `DEFAULT_SPAN`.
 *  REFS app/(app)/dashboard/layout-actions.ts › resetArrangementAction() — the only caller
 *       lib/dashboard/geometry.ts › packLayout() — what fills the gap once the rows are gone */
export async function resetProfile(userId: string, profile: DashboardProfile): Promise<void> {
  await prisma.dashboardLayout.deleteMany({ where: { userId, profile } });
}
