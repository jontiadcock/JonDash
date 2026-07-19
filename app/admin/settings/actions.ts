"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { applySettingsForm, settingKeysByGroup, type SettingsFormState } from "@/lib/settings";

export type SettingsState = SettingsFormState;

/** Save the general (non-critical) settings on the Settings page. */
export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");

  const errors = await applySettingsForm(formData, settingKeysByGroup("general"));
  if (Object.keys(errors).length > 0) return { errors };

  await audit("settings.updated", { userId: admin.id });
  revalidatePath("/admin/settings");
  return { success: "Settings saved." };
}
