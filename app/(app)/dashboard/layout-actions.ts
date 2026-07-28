"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { setItemSize, placeItems, resetItem, isProfile } from "@/lib/dashboard/layout";
import type { DashboardKind, DashboardProfile } from "@/lib/dashboard/layout";
import { visibleModuleIds } from "@/lib/modules/visibility";
import { getUserVisibleLinks } from "@/lib/services";

/**
 * Dashboard layout actions (CORE-11 / CORE-12).
 *
 * Every one is scoped to the CALLER's own layout — the user id comes from the session, never
 * from the form — so nobody can rearrange somebody else's dashboard.
 *
 * **Both kinds are checked against what this user can actually see.** For widgets that was
 * always true; it matters just as much for service tiles, because a tile can belong to a
 * service group. Without the check, a crafted request could write layout rows for a link the
 * caller has no access to, which both pollutes their dashboard and answers "does this id
 * exist?" for something they were never shown.
 */
type Allowed = { id: string; modules: Set<string>; links: Set<string> };

async function gate(): Promise<Allowed> {
  await assertSameOrigin();
  const user = await requireUser();
  const [modules, links] = await Promise.all([
    visibleModuleIds({ id: user.id, role: user.role as "ADMIN" | "USER" }),
    getUserVisibleLinks(user.id),
  ]);
  return { id: user.id, modules, links: new Set(links.map((l) => l.id)) };
}

function permits(allowed: Allowed, kind: DashboardKind, refId: string): boolean {
  return kind === "module" ? allowed.modules.has(refId) : allowed.links.has(refId);
}

/** An unrecognised profile falls back to `wide` rather than throwing — a layout write is not
 *  worth failing a page over, and `wide` is the arrangement most people have. */
function asProfile(v: string): DashboardProfile {
  return isProfile(v) ? v : "wide";
}

function asKind(v: string): DashboardKind {
  return v === "link" ? "link" : "module";
}

export async function setItemSizeAction(
  kind: string,
  refId: string,
  profile: string,
  width: number,
  height: number,
): Promise<void> {
  const allowed = await gate();
  const k = asKind(kind);
  if (!permits(allowed, k, refId)) return;
  await setItemSize(allowed.id, k, refId, asProfile(profile), width, height);
  revalidatePath("/dashboard");
}

/**
 * Save where everything sits — what a drag or a move button produces (free placement, 1.8.0).
 *
 * The submitted list is filtered to items this user may see before anything is written, so a
 * crafted request can neither move nor create rows for anything restricted. Columns and rows are
 * clamped in `placeItems`, so a hostile coordinate cannot store a position that will not render.
 */
export async function placeItemsAction(
  profile: string,
  placements: { kind: string; id: string; col: number; row: number }[],
): Promise<void> {
  const allowed = await gate();
  const safe = placements
    .map((i) => ({ kind: asKind(i.kind), id: i.id, col: Math.trunc(i.col), row: Math.trunc(i.row) }))
    .filter((i) => permits(allowed, i.kind, i.id) && Number.isFinite(i.col) && Number.isFinite(i.row));
  if (safe.length === 0) return;
  await placeItems(allowed.id, asProfile(profile), safe);
  revalidatePath("/dashboard");
}

export async function resetItemAction(kind: string, refId: string, profile: string): Promise<void> {
  const allowed = await gate();
  const k = asKind(kind);
  if (!permits(allowed, k, refId)) return;
  await resetItem(allowed.id, k, refId, asProfile(profile));
  revalidatePath("/dashboard");
}
