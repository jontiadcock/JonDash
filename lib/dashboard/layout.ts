import "server-only";
import { prisma } from "@/lib/db";

/**
 * Per-user dashboard layout — for module widgets AND service tiles (CORE-11), stored
 * separately per device profile (CORE-12).
 *
 * Moved out of `lib/modules/` because it stopped being about modules: one ordering now spans
 * both kinds of thing on the dashboard, and leaving it under `modules` would have implied
 * otherwise to the next person reading it.
 *
 * **Why a per-user table rather than each item's own `sortOrder`.** For widgets this was
 * always about not changing other people's dashboards. For tiles it is stronger than a
 * nicety: a `Link` with a `roleId` belongs to a service group and is visible to every member,
 * so writing one user's arrangement into `Link.sortOrder` would silently reorder that tile
 * for all of them. The arrangement has to live here.
 *
 * A user with no saved row gets the default size, ordered after everything that has one, so
 * the feature stays invisible until somebody uses it.
 */

/*
 * The geometry — column counts, default spans, the height ceiling, `itemKey` — lives in
 * `./geometry`, which is deliberately NOT server-only: the grid is a client component and needs
 * the same numbers. Re-exported here so server callers keep importing from one place.
 */
export {
  PROFILES,
  isProfile,
  GEOMETRY,
  DEFAULT_SPAN,
  MAX_HEIGHT,
  MIN_SPAN,
  itemKey,
  type DashboardKind,
  type DashboardProfile,
} from "./geometry";

import {
  DEFAULT_SPAN,
  GEOMETRY,
  MAX_HEIGHT,
  itemKey,
  type DashboardKind,
  type DashboardProfile,
} from "./geometry";

export type LayoutEntry = {
  kind: DashboardKind;
  refId: string;
  width: number;
  height: number;
  sortOrder: number;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(Math.round(n), min), max);
}

/** A user's saved layout for one profile, keyed by `kind:refId`. */
export async function getUserLayout(
  userId: string,
  profile: DashboardProfile,
): Promise<Map<string, LayoutEntry>> {
  const rows = await prisma.dashboardLayout.findMany({
    where: { userId, profile },
    select: { kind: true, refId: true, width: true, height: true, sortOrder: true },
  });
  return new Map(
    rows
      .filter((r): r is typeof r & { kind: DashboardKind } => r.kind === "module" || r.kind === "link")
      .map((r) => [itemKey(r.kind, r.refId), r]),
  );
}

/**
 * Order dashboard items for a user: saved positions first (by sortOrder), then anything
 * without a saved row in its natural order.
 *
 * Items are `{kind, id}` so tiles and widgets sort against each other in ONE sequence — that
 * single ordering is the whole point of CORE-11.
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

/** The span to render for an item — its saved one, or the default for its kind. */
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

/** Resize one item, for one user, in one profile. */
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
 * Persist an arbitrary order for this user, in one profile.
 *
 * Writes the WHOLE visible order — not just the moved item — so items that never had a saved
 * row get one and positions stay consistent afterwards. `ordered` is what the user is actually
 * looking at, so the result matches the rendered order rather than a server-side guess.
 *
 * The caller is responsible for having filtered `ordered` to items this user may see.
 */
export async function reorderItems(
  userId: string,
  profile: DashboardProfile,
  ordered: { kind: DashboardKind; id: string }[],
): Promise<void> {
  if (ordered.length === 0) return;
  const existing = await getUserLayout(userId, profile);
  await prisma.$transaction(
    ordered.map((item, index) => {
      const prev = existing.get(itemKey(item.kind, item.id));
      const fallback = DEFAULT_SPAN[profile][item.kind];
      return prisma.dashboardLayout.upsert({
        where: { userId_profile_kind_refId: { userId, profile, kind: item.kind, refId: item.id } },
        create: {
          userId,
          profile,
          kind: item.kind,
          refId: item.id,
          width: prev?.width ?? fallback.width,
          height: prev?.height ?? fallback.height,
          sortOrder: index,
        },
        update: { sortOrder: index },
      });
    }),
  );
}

/** Forget a user's customisation for one item, in one profile. */
export async function resetItem(
  userId: string,
  kind: DashboardKind,
  refId: string,
  profile: DashboardProfile,
): Promise<void> {
  await prisma.dashboardLayout.deleteMany({ where: { userId, kind, refId, profile } });
}

/** Forget the whole arrangement for one profile — "reset my phone layout". */
export async function resetProfile(userId: string, profile: DashboardProfile): Promise<void> {
  await prisma.dashboardLayout.deleteMany({ where: { userId, profile } });
}
