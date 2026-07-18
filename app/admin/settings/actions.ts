"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { SETTINGS, writeSetting, type SettingKey } from "@/lib/settings";

export type SettingsState = { errors?: Record<string, string>; success?: string };

/** Save the global settings form. Validates every field, writes valid ones. */
export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const errors: Record<string, string> = {};
  const keys = Object.keys(SETTINGS) as SettingKey[];

  for (const key of keys) {
    const raw = String(formData.get(key) ?? "");
    const err = await writeSetting(key, raw);
    if (err) errors[key] = err;
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  await audit("settings.updated", { userId: admin.id });
  revalidatePath("/admin/settings");
  return { success: "Settings saved." };
}
