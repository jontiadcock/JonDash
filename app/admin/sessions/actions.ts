"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

/** Admin: revoke any single session by id. */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const res = await prisma.session.deleteMany({ where: { id: sessionId } });
  if (res.count > 0) {
    await audit("session.revoked.admin", { userId: admin.id, detail: sessionId });
  }
  revalidatePath("/admin/sessions");
}
