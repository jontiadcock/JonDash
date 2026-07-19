"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { applySettingsForm, settingKeysByGroup, type SettingsFormState } from "@/lib/settings";

/** Save the audit-log retention setting, shown on the Audit page. */
export async function saveAuditSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await assertSameOrigin();
  const admin = await requirePermission("audit.view");

  const errors = await applySettingsForm(formData, settingKeysByGroup("audit"));
  if (Object.keys(errors).length > 0) return { errors };

  await audit("settings.audit.updated", { userId: admin.id });
  revalidatePath("/admin/audit");
  return { success: "Audit settings saved." };
}
