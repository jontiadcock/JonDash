"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import {
  applySettingsFormDetailed,
  settingKeysByGroup,
  writeSetting,
  getLogoFilename,
  type SettingsFormState,
} from "@/lib/settings";
import { processIconUpload } from "@/lib/security/upload";
import { deleteIcon } from "@/lib/icons";
import { writeChannel, isChannel } from "@/lib/update-channel";
import { writeAutoInstall, clearUpdateFailure } from "@/lib/update-prefs";

export type SettingsState = SettingsFormState;

export type ChannelState = { error?: string; ok?: boolean; channel?: string };

export type AutoInstallState = { error?: string; ok?: boolean; autoInstall?: boolean };

/** Toggle whether the launcher auto-installs updates at startup (default off). */
export async function saveAutoInstallAction(
  _prev: AutoInstallState,
  formData: FormData,
): Promise<AutoInstallState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");
  const on = formData.get("autoInstall") === "on";
  writeAutoInstall(on);
  await audit("settings.auto-update", { userId: admin.id, detail: on ? "on" : "off" });
  revalidatePath("/admin/updates");
  return { ok: true, autoInstall: on };
}

/** Dismiss the "last update failed" notice (clears the rollback marker). */
export async function dismissUpdateFailureAction(): Promise<void> {
  await assertSameOrigin();
  await requirePermission("settings.manage");
  clearUpdateFailure();
  revalidatePath("/admin/updates");
}

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

/**
 * Save the branding settings (app name, accent colour) — CORE-06.
 *
 * Kept separate from the general save so the audit entry names it as a branding change, and
 * so a validation error in one section doesn't discard the other's input. Revalidates the
 * layout because the name and accent render in every header.
 */
export async function updateBrandingAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");

  const { errors, changed } = await applySettingsFormDetailed(formData, settingKeysByGroup("branding"));
  if (Object.keys(errors).length > 0) return { errors };

  await audit("settings.branding.updated", { userId: admin.id, detail: changed.join(", ") || "no change" });
  revalidatePath("/", "layout"); // header brand + tab title live in the root layout
  return { success: "Branding saved." };
}

/** Choose the interface style (CORE-07). Re-renders every layout — it restyles the whole app. */
export async function saveStyleAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");

  const chosen = String(formData.get("style") ?? "");
  const err = await writeSetting("branding.style", chosen);
  if (err) return { errors: { "branding.style": "That isn't one of the available styles." } };

  await audit("settings.branding.style", { userId: admin.id, detail: chosen });
  revalidatePath("/", "layout");
  return { success: "Style applied." };
}

/**
 * Upload (or remove) the instance logo — CORE-06.
 *
 * Reuses the hardened icon path: size-capped, magic-byte allowlisted (SVG refused — script
 * risk), and re-encoded through sharp, which drops any embedded payload. The stored file
 * keeps a random name and lives outside the web root.
 */
export async function uploadLogoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");

  const previous = await getLogoFilename();

  if (formData.get("remove") === "1") {
    await writeSetting("branding.logo", "");
    await deleteIcon(previous);
    await audit("settings.branding.logo", { userId: admin.id, detail: "removed" });
    revalidatePath("/", "layout");
    return { success: "Logo removed." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { errors: { "branding.logo": "Choose an image." } };

  const result = await processIconUpload(file);
  if (!result.ok) return { errors: { "branding.logo": result.error } };

  const err = await writeSetting("branding.logo", result.filename);
  if (err) return { errors: { "branding.logo": err } };
  // Only once the new one is recorded — otherwise a failed write would leave no logo at all.
  await deleteIcon(previous);

  await audit("settings.branding.logo", { userId: admin.id, detail: "updated" });
  revalidatePath("/", "layout");
  return { success: "Logo updated." };
}

/** Save the general (non-critical) settings on the Settings page. */
export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");

  const { errors, changed } = await applySettingsFormDetailed(formData, settingKeysByGroup("general"));
  if (Object.keys(errors).length > 0) return { errors };

  // Name WHICH settings changed, not just that some did (BUG-24). Secret values
  // are redacted by applySettingsFormDetailed, never by this call site.
  await audit("settings.updated", { userId: admin.id, detail: changed.join(", ") || "no change" });
  revalidatePath("/admin/settings");
  return { success: "Settings saved." };
}
