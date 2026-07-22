"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { setModuleSize, moveModule, resetModuleLayout } from "@/lib/modules/layout";
import { visibleModuleIds } from "@/lib/modules/visibility";

/**
 * Dashboard layout actions. Every one is scoped to the CALLER's own layout — the user id
 * comes from the session, never from the form — so one user can't rearrange another's
 * dashboard. The module id is checked against what this user is actually allowed to see,
 * so these can't be used to probe for the existence of a restricted module either.
 */
async function gate(moduleId: string): Promise<{ id: string; allowed: Set<string> } | null> {
  await assertSameOrigin();
  const user = await requireUser();
  const allowed = await visibleModuleIds({ id: user.id, role: user.role as "ADMIN" | "USER" });
  if (!allowed.has(moduleId)) return null;
  return { id: user.id, allowed };
}

export async function setWidgetSizeAction(moduleId: string, width: number, height: number): Promise<void> {
  const user = await gate(moduleId);
  if (!user) return;
  await setModuleSize(user.id, moduleId, width, height);
  revalidatePath("/dashboard");
}

export async function moveWidgetAction(
  moduleId: string,
  direction: "up" | "down",
  orderedIds: string[],
): Promise<void> {
  const user = await gate(moduleId);
  if (!user) return;
  // Only reorder within what this user can see, so a crafted list can't write layout rows
  // for modules they have no access to.
  const safeOrder = orderedIds.filter((id) => user.allowed.has(id));
  await moveModule(user.id, moduleId, direction, safeOrder);
  revalidatePath("/dashboard");
}

export async function resetWidgetAction(moduleId: string): Promise<void> {
  const user = await gate(moduleId);
  if (!user) return;
  await resetModuleLayout(user.id, moduleId);
  revalidatePath("/dashboard");
}
