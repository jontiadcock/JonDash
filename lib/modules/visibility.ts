import "server-only";
import { prisma } from "@/lib/db";

/**
 * Who may see a module (MOD-01 P2 — module RBAC via Service Groups).
 *
 * Mirrors how service tiles are shared, with one deliberate difference: a module with NO
 * groups assigned stays visible to every signed-in user. That was its behaviour before
 * this existed, so adding the feature doesn't silently hide working modules from people;
 * assigning groups is the act that restricts it. `adminOnly` on the definition still wins
 * over everything — a module that declares itself admin-only is never shown to a USER.
 *
 * This is enforced server-side at BOTH entry points (the dashboard widget list and the
 * /m/<id> route), not just hidden in the UI.
 */

export type ModuleViewer = { id: string; role: "ADMIN" | "USER" };

/** Group ids a module is limited to. Empty = unrestricted. */
export async function moduleGroupIds(moduleId: string): Promise<string[]> {
  const row = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { roles: { select: { id: true } } },
  });
  return row?.roles.map((r) => r.id) ?? [];
}

/** The Service Group ids a user belongs to. */
export async function userGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.serviceRole.findMany({
    where: { users: { some: { id: userId } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Module ids this viewer may see. Admins see everything; a USER sees modules with no
 * group restriction plus those shared with a group they're in.
 */
export async function visibleModuleIds(viewer: ModuleViewer): Promise<Set<string>> {
  const rows = await prisma.module.findMany({
    where: { enabled: true },
    select: { id: true, roles: { select: { id: true } } },
  });
  if (viewer.role === "ADMIN") return new Set(rows.map((r) => r.id));

  const mine = new Set(await userGroupIds(viewer.id));
  return new Set(
    rows
      .filter((r) => r.roles.length === 0 || r.roles.some((g) => mine.has(g.id)))
      .map((r) => r.id),
  );
}

/** Whether one module is visible to this viewer (the /m/<id> route guard). */
export async function canViewModule(moduleId: string, viewer: ModuleViewer): Promise<boolean> {
  if (viewer.role === "ADMIN") return true;
  const groups = await moduleGroupIds(moduleId);
  if (groups.length === 0) return true; // unrestricted
  const mine = new Set(await userGroupIds(viewer.id));
  return groups.some((g) => mine.has(g));
}

/** Replace the Service Groups a module is limited to (admin action). */
export async function setModuleGroups(moduleId: string, groupIds: string[]): Promise<void> {
  await prisma.module.update({
    where: { id: moduleId },
    data: { roles: { set: groupIds.map((id) => ({ id })) } },
  });
}
