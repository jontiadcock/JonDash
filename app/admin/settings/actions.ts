"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { applySettingsForm, settingKeysByGroup, type SettingsFormState } from "@/lib/settings";
import { writeChannel, isChannel } from "@/lib/update-channel";

export type SettingsState = SettingsFormState;

export type ChannelState = { error?: string; ok?: boolean; channel?: string };

/** Choose the update channel (stable = main branch, beta = beta branch). */
export async function saveUpdateChannelAction(
  _prev: ChannelState,
  formData: FormData,
): Promise<ChannelState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");

  const raw = String(formData.get("channel") ?? "");
  if (!isChannel(raw)) return { error: "Choose a valid channel." };

  writeChannel(raw);
  await audit("settings.update-channel", { userId: admin.id, detail: raw });
  revalidatePath("/admin/updates");
  // Return the saved channel so the client can reflect it immediately — the
  // client component's `channel` prop wouldn't otherwise update until a reload.
  return { ok: true, channel: raw };
}

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
