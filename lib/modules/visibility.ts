import "server-only";
import { prisma } from "@/lib/db";

/*
 * Who may see a module — module RBAC via Service Groups, mirroring how service tiles are shared.
 *
 * ⚠ **No groups assigned means visible to everyone signed in.** That was the behaviour before this
 *   existed, so adding the feature does not silently hide working modules; assigning groups is the
 *   act that restricts. `adminOnly` on the definition still wins over everything.
 * ⚠ **Enforced server-side at BOTH entry points**, not hidden in the UI.
 * REFS app/(app)/dashboard/page.tsx — the widget list · app/(app)/m/[module]/[[...path]]/page.tsx
 * PINS tests/integration/module-rbac.test.ts
 */

export type ModuleViewer = { id: string; role: "ADMIN" | "USER" };

/** Groups a module is limited to; empty is unrestricted. REFS app/admin/modules/[id]/page.tsx */
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
/** REFS app/(app)/dashboard/page.tsx · layout-actions.ts — entry point one. */
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
/** REFS app/(app)/m/[module]/[[...path]]/page.tsx — entry point two. */
export async function canViewModule(moduleId: string, viewer: ModuleViewer): Promise<boolean> {
  if (viewer.role === "ADMIN") return true;
  const groups = await moduleGroupIds(moduleId);
  if (groups.length === 0) return true; // unrestricted
  const mine = new Set(await userGroupIds(viewer.id));
  return groups.some((g) => mine.has(g));
}

/** Replace the Service Groups a module is limited to (admin action). */
/** REFS app/admin/modules/actions.ts › setModuleGroupsAction(). */
export async function setModuleGroups(moduleId: string, groupIds: string[]): Promise<void> {
  await prisma.module.update({
    where: { id: moduleId },
    data: { roles: { set: groupIds.map((id) => ({ id })) } },
  });
}
