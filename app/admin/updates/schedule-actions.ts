"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { applySettingsFormDetailed, settingKeysByGroup } from "@/lib/settings";
import { writeChannel, isChannel } from "@/lib/update-channel";
import { writeAutoInstall } from "@/lib/update-prefs";
import { writeSetting } from "@/lib/settings";
import { resolveHelperChannel } from "@/lib/helpers/channel";

export type ScheduleState = { ok?: boolean; error?: string };

/**
 * When automatic updates run, and what is opted in to them (BUG-30).
 *
 * Kept on the Updates page rather than Settings: until now the channel, the app's own
 * auto-update, per-module auto-update and the module/helper update lists lived in four
 * different places, so "what updates itself, and when" could not be answered from any
 * single screen.
 */

async function gate() {
  await assertSameOrigin();
  return requirePermission("settings.manage");
}

export async function saveUpdateScheduleAction(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const admin = await gate();

  const { errors, changed } = await applySettingsFormDetailed(formData, settingKeysByGroup("updates"));
  if (Object.keys(errors).length > 0) {
    return { error: Object.values(errors)[0] ?? "Check the schedule values." };
  }

  await audit("settings.updates.schedule", {
    userId: admin.id,
    detail: changed.join(", ") || "no change",
  });
  revalidatePath("/admin/updates");
  return { ok: true };
}

/**
 * Opt one helper in or out of automatic updates.
 *
 * Separate from the module toggle on purpose even though the shape is identical: a helper
 * does the privileged work modules are forbidden, so letting one update itself unattended
 * is a bigger trust decision, and the audit entry should say which kind it was.
 */
export async function setHelperAutoUpdateAction(formData: FormData): Promise<void> {
  const admin = await gate();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const on = String(formData.get("autoUpdate") ?? "") === "on";

  await prisma.helper.updateMany({ where: { id }, data: { autoUpdate: on } });
  await audit("admin.helper.autoupdate", {
    userId: admin.id,
    detail: `${id}=${on ? "on" : "off"}`,
  });
  revalidatePath("/admin/updates");
  revalidatePath("/admin/helpers");
}

// The MODULE equivalent deliberately isn't here: `setModuleAutoUpdateAction` already exists
// in app/admin/modules/actions.ts and the toggle reuses it. Two actions writing the same
// column would mean two audit strings and two places to keep a rule in step.

/** The master switch for automatic updates. */
export async function setAutoUpdateEnabledAction(formData: FormData): Promise<void> {
  const admin = await gate();
  const on = String(formData.get("enabled") ?? "") === "on";
  await writeSetting("updates.autoEnabled", on ? "1" : "0");
  await audit("settings.updates.auto", { userId: admin.id, detail: on ? "on" : "off" });
  revalidatePath("/admin/updates");
}

/**
 * Exclude one thing from automatic updates, or include it again.
 *
 * A helper excluded here is still updated when a module that needs it updates — excluding
 * it opts it out of being updated for its own sake, not out of being a working dependency.
 */
export async function setAutoUpdateExcludedAction(formData: FormData): Promise<void> {
  const admin = await gate();
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const excluded = String(formData.get("excluded") ?? "") === "on";
  if (!id) return;

  if (kind === "app") {
    // JonDash's own auto-install is a .data file the LAUNCHER reads before the app runs,
    // so it can't live in the database like the others.
    writeAutoInstall(!excluded);
  } else if (kind === "module") {
    await prisma.module.updateMany({ where: { id }, data: { autoUpdateExcluded: excluded } });
  } else if (kind === "helper") {
    await prisma.helper.updateMany({ where: { id }, data: { autoUpdateExcluded: excluded } });
  } else {
    return;
  }

  await audit("settings.updates.auto.exclude", {
    userId: admin.id,
    detail: `${kind}:${id}=${excluded ? "excluded" : "included"}`,
  });
  revalidatePath("/admin/updates");
}

/** Move JonDash itself between the stable and beta channels. */
export async function setAppChannelAction(formData: FormData): Promise<void> {
  const admin = await gate();
  const raw = String(formData.get("channel") ?? "");
  if (!isChannel(raw)) return;
  writeChannel(raw);
  await audit("settings.update-channel", { userId: admin.id, detail: raw });
  revalidatePath("/admin/updates");
}

/**
 * Pin a helper to a channel, or clear the pin.
 *
 * A helper's channel is normally DERIVED — it follows the highest channel among the
 * modules that need it. Sending the channel it is already on clears the pin and returns
 * it to that, so the switch is a three-state control with two positions: on = pinned to
 * beta, off = back to derived (which may still be beta if a module put it there).
 */
export async function setHelperChannelPinAction(formData: FormData): Promise<void> {
  const admin = await gate();
  const id = String(formData.get("helperId") ?? "");
  const raw = String(formData.get("channel") ?? "");
  if (!id) return;

  const pin = raw === "beta" ? "beta" : null; // switching off returns it to derived
  const existing = await prisma.helper.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return;

  await prisma.helper.update({ where: { id }, data: { channelPin: pin } });
  const state = await resolveHelperChannel(id);
  await prisma.helper.update({ where: { id }, data: { channel: state.channel } });

  await audit("admin.helper.channel", {
    userId: admin.id,
    detail: `${id}=${pin ?? "derived"} (now ${state.channel})`,
  });
  revalidatePath("/admin/updates");
  revalidatePath("/admin/helpers");
}
