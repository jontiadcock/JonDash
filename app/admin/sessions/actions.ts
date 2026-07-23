"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { applySettingsFormDetailed, settingKeysByGroup, type SettingsFormState } from "@/lib/settings";

/** Admin: revoke any single session by id. */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requirePermission("sessions.manage");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const res = await prisma.session.deleteMany({ where: { id: sessionId } });
  if (res.count > 0) {
    await audit("session.revoked.admin", { userId: admin.id, detail: sessionId });
  }
  revalidatePath("/admin/sessions");
}

/** Save the session-lifetime settings, shown on the Sessions page. */
export async function saveSessionSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await assertSameOrigin();
  const admin = await requirePermission("sessions.manage");

  const { errors, changed } = await applySettingsFormDetailed(formData, settingKeysByGroup("sessions"));
  if (Object.keys(errors).length > 0) return { errors };

  // Name WHICH settings changed, not just that some did (BUG-24). Secret values
  // are redacted by applySettingsFormDetailed, never by this call site.
  await audit("settings.session.updated", { userId: admin.id, detail: changed.join(", ") || "no change" });
  revalidatePath("/admin/sessions");
  return { success: "Session settings saved." };
}
