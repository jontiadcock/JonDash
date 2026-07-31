"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { applySettingsFormDetailed, settingKeysByGroup } from "@/lib/settings";
import { writeChannel, isChannel } from "@/lib/update-channel";
import { clearUpdateStatusCache } from "@/lib/update";
import { writeAutoInstall } from "@/lib/update-prefs";
import { writeSetting } from "@/lib/settings";
import { resolveHelperChannel } from "@/lib/helpers/channel";
import { invalidateHelperUpdateCache } from "@/lib/helpers/updates";

/** REFS ./schedule-form.tsx — the `useActionState` shape */
export type ScheduleState = { ok?: boolean; error?: string };

/*
 * When automatic updates run and what is opted in (BUG-30). ⚠ All of it lives on the Updates page:
 * the channel, the app's own auto-update, per-item auto-update and the update lists were once in
 * four places, so "what updates itself, and when" could not be answered from any single screen.
 * REFS lib/updates/schedule.ts — reads what these write · lib/settings.ts › the updates group
 */

async function gate() {
  await assertSameOrigin();
  return requirePermission("settings.manage");
}

/** REFS ./schedule-form.tsx · lib/settings.ts › settingKeysByGroup("updates") — the only keys
 *  this form may write · lib/updates/schedule.ts — what reads them back */
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
 * Opt one helper in or out of automatic updates. ⚠ Separate from the module toggle despite the
 * identical shape: a helper does the privileged work modules are forbidden, so the audit entry
 * must say which kind it was. REFS app/admin/modules/actions.ts › setModuleAutoUpdateAction()
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

// ⚠ Do not add a module equivalent here — `setModuleAutoUpdateAction` already exists in
// app/admin/modules/actions.ts, and two actions writing one column means two rules to keep in step.

/** The master switch. ⚠ Turning it on gives every source you have added a standing channel to run
 *  new code here. REFS ./auto-update-panel.tsx · lib/updates/auto-run.ts — checks it first */
export async function setAutoUpdateEnabledAction(formData: FormData): Promise<void> {
  const admin = await gate();
  const on = String(formData.get("enabled") ?? "") === "on";
  await writeSetting("updates.autoEnabled", on ? "1" : "0");
  await audit("settings.updates.auto", { userId: admin.id, detail: on ? "on" : "off" });
  revalidatePath("/admin/updates");
}

/**
 * Exclude one thing from automatic updates, or include it again. ⚠ An excluded HELPER is still
 * updated when a module that needs it updates — exclusion opts it out of being updated for its own
 * sake, not out of being a working dependency. REFS lib/updates/auto-run.ts — where that happens
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

/** Move JonDash between the stable and beta channels. ⚠ Must clear the update-status cache — a
 *  cached status was read from the OTHER channel's manifest.
 *  REFS lib/update-channel.ts › writeChannel() · lib/update.ts › clearUpdateStatusCache()
 *  PINS tests/unit/update-cache-invalidation.test.ts */
export async function setAppChannelAction(formData: FormData): Promise<void> {
  const admin = await gate();
  const raw = String(formData.get("channel") ?? "");
  if (!isChannel(raw)) return;
  writeChannel(raw);
  // The cached status was read from the OTHER channel's manifest — keeping it would offer
  // the wrong release for up to three minutes and make the switch look inert.
  clearUpdateStatusCache();
  await audit("settings.update-channel", { userId: admin.id, detail: raw });
  revalidatePath("/admin/updates");
}

/**
 * Pin a helper to a channel, or clear the pin. A helper's channel is normally DERIVED from the
 * highest channel among the modules needing it, so this is a three-state control with two
 * positions: on = pinned to beta, off = back to derived, which may still be beta.
 * REFS lib/helpers/channel.ts › resolveHelperChannel() · ./beta-channels.tsx
 * PINS tests/unit/helper-channel-pin.test.ts
 */
export async function setHelperChannelPinAction(formData: FormData): Promise<void> {
  const admin = await gate();
  const id = String(formData.get("helperId") ?? "");
  const raw = String(formData.get("channel") ?? "");
  if (!id) return;

  const existing = await prisma.helper.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return;

  /*
   * ⚠ Set an explicit PIN, do not merely clear one. `channel = pin ?? derived`, so on a helper that
   * is on beta by DERIVATION clearing the pin re-derives straight back to beta and the switch does
   * nothing. Asking for the value it would derive anyway is what clears the pin, so it goes back to
   * following its modules rather than freezing at a value that matches only today.
   */
  const target: "beta" | "stable" = raw === "beta" ? "beta" : "stable";
  const before = await resolveHelperChannel(id);
  const pin = target === before.derived ? null : target;

  await prisma.helper.update({ where: { id }, data: { channelPin: pin } });
  const state = await resolveHelperChannel(id);
  await prisma.helper.update({ where: { id }, data: { channel: state.channel } });

  await audit("admin.helper.channel", {
    userId: admin.id,
    detail: `${id}=${pin ?? "derived"} (now ${state.channel})`,
  });

  /*
   * ⚠ MUST invalidate or the write is invisible: `getHelperUpdateStatus()` caches for three minutes
   * and the Beta channels panel reads the channel from that cache, so the row redraws in its old
   * position and survives a full reload — the cache is in-process, not per-request. Modules were
   * unaffected because their rows come straight from Prisma.
   * REFS lib/helpers/updates.ts › invalidateHelperUpdateCache()
   */
  invalidateHelperUpdateCache();
  revalidatePath("/admin/updates");
  revalidatePath("/admin/helpers");
}
