import "server-only";
import { prisma } from "@/lib/db";

/**
 * Per-user dashboard layout for module widgets (MOD-04 groundwork).
 *
 * Size and position are stored PER USER, so arranging your own dashboard never changes
 * anyone else's — the same module can be a compact tile for one person and full width for
 * another. A user with no saved row gets the default size, ordered after everyone that
 * does, so the feature is invisible until someone uses it.
 *
 * Sizes are expressed in grid units rather than pixels: the dashboard grid is responsive,
 * so a "2-wide" widget is two columns at desktop and still full width on a phone.
 */

export const MAX_WIDTH = 3;
export const MAX_HEIGHT = 3;

export type ModuleLayoutEntry = { moduleId: string; width: number; height: number; sortOrder: number };

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(Math.round(n), min), max);
}

/** A user's saved layout, keyed by module id. */
export async function getUserModuleLayout(userId: string): Promise<Map<string, ModuleLayoutEntry>> {
  const rows = await prisma.moduleLayout.findMany({
    where: { userId },
    select: { moduleId: true, width: true, height: true, sortOrder: true },
  });
  return new Map(rows.map((r) => [r.moduleId, r]));
}

/**
 * Order module ids for a user: saved positions first (by sortOrder), then anything
 * without a saved row in its natural order.
 */
export function applyLayoutOrder<T extends { def: { id: string } }>(
  modules: T[],
  layout: Map<string, ModuleLayoutEntry>,
): T[] {
  return [...modules].sort((a, b) => {
    const la = layout.get(a.def.id);
    const lb = layout.get(b.def.id);
    if (la && lb) return la.sortOrder - lb.sortOrder;
    if (la) return -1; // positioned widgets come before unpositioned ones
    if (lb) return 1;
    return 0;
  });
}

/** Resize one widget for one user. */
export async function setModuleSize(
  userId: string,
  moduleId: string,
  width: number,
  height: number,
): Promise<void> {
  const w = clamp(width, 1, MAX_WIDTH);
  const h = clamp(height, 1, MAX_HEIGHT);
  await prisma.moduleLayout.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: { userId, moduleId, width: w, height: h, sortOrder: await nextSortOrder(userId) },
    update: { width: w, height: h },
  });
}

async function nextSortOrder(userId: string): Promise<number> {
  const last = await prisma.moduleLayout.findFirst({
    where: { userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

/**
 * Move a widget one place earlier/later for this user. `orderedIds` is what the user is
 * actually looking at, so the move matches the rendered order even for modules that have
 * never been positioned before — those get a row written as part of the move.
 */
export async function moveModule(
  userId: string,
  moduleId: string,
  direction: "up" | "down",
  orderedIds: string[],
): Promise<void> {
  const from = orderedIds.indexOf(moduleId);
  if (from === -1) return;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= orderedIds.length) return; // already at the end

  const reordered = [...orderedIds];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];

  // Persist the whole visible order, so positions stay consistent no matter which
  // widgets had saved rows beforehand.
  const existing = await getUserModuleLayout(userId);
  for (const [index, id] of reordered.entries()) {
    const prev = existing.get(id);
    await prisma.moduleLayout.upsert({
      where: { userId_moduleId: { userId, moduleId: id } },
      create: { userId, moduleId: id, width: prev?.width ?? 1, height: prev?.height ?? 1, sortOrder: index },
      update: { sortOrder: index },
    });
  }
}

/** Forget a user's customisation for one module (back to the default size/position). */
export async function resetModuleLayout(userId: string, moduleId: string): Promise<void> {
  await prisma.moduleLayout.deleteMany({ where: { userId, moduleId } });
}
