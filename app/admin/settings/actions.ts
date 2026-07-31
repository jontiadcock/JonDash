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
import { resolvePalette } from "@/lib/styles";
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

/** Dismiss the "last update failed" notice. ⚠ Clearing the marker also lets the failed version be
 *  offered again — it is a dismissal, not a fix.
 *  REFS lib/update-prefs.ts › clearUpdateFailure() · app/admin/settings/updates-panel.tsx */
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
  // Returned so the client reflects it immediately — its `channel` prop would not update until
  // a reload otherwise.
  return { ok: true, channel: raw };
}

/**
 * Save the branding settings (CORE-06). Separate from the general save so the audit entry names it
 * as a branding change and a validation error in one section does not discard the other's input.
 * ⚠ Revalidates the LAYOUT, not the page — the name and accent render in every header.
 * REFS app/admin/settings/page.tsx · lib/settings.ts › settingKeysByGroup("branding")
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

/**
 * Choose the interface style and its palette (CORE-07). ⚠ Both are written together and the
 * pairing normalised, because a palette id only means something inside its style — a stale one
 * would otherwise be stored as an invalid combination.
 * REFS lib/styles.ts › resolvePalette() · app/admin/settings/style-form.tsx
 */
export async function saveStyleAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await assertSameOrigin();
  const admin = await requirePermission("settings.manage");

  const chosen = String(formData.get("style") ?? "");
  const err = await writeSetting("branding.style", chosen);
  if (err) return { errors: { "branding.style": "That isn't one of the available styles." } };

  const palette = resolvePalette(chosen, String(formData.get("palette") ?? "")).id;
  await writeSetting("branding.palette", palette);

  await audit("settings.branding.style", { userId: admin.id, detail: `${chosen}/${palette}` });
  revalidatePath("/", "layout");
  return { success: "Style applied." };
}

/**
 * Upload or remove the instance logo (CORE-06). ⚠ Must keep using the hardened icon path —
 * size-capped, magic-byte allowlisted with SVG refused for script risk, and re-encoded so any
 * embedded payload is dropped. The stored file gets a random name outside the web root.
 * REFS lib/security/upload.ts · lib/icons.ts › saveIconPng() · app/admin/settings/logo-form.tsx
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

/** Save the general settings. ⚠ Scoped to the "general" group, so this form cannot write a
 *  sessions, audit or network key. REFS lib/settings.ts › settingKeysByGroup() ·
 *  app/admin/settings/page.tsx */
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
