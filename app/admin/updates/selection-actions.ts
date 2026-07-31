"use server";

import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { compareVersions } from "@/lib/version";
import { revalidatePath } from "next/cache";
import { getAppVersion, getUpdateStatus } from "@/lib/update";
import { getModuleUpdateStatus } from "@/lib/modules/updates";
import { fetchSourceManifest, DEFAULT_SOURCE_URL } from "@/lib/modules/sources";
import { installHelper } from "@/lib/helpers/install";
import { getHelperUpdateStatus, invalidateHelperUpdateCache } from "@/lib/helpers/updates";
import { resolveHelperChannel } from "@/lib/helpers/channel";
import { clearModuleUpdateCache } from "@/lib/modules/updates";
import { regenerateRegistry, markModuleInstalling, requestRebuildAndRestart } from "@/lib/modules/rebuild";
import { applyModuleUpdates } from "./module-actions";
import { queueAddonUpdates, takeQueuedAddonUpdates } from "@/lib/update-queue";

/** REFS ./available-updates.tsx — the `useActionState` shape */
export type SelectionState = { ok?: boolean; error?: string };

/**
 * Stage one of "Update everything": remember the add-ons for after JonDash's own update lands.
 * ⚠ Written to disk, not held in memory — the caller applies the core update immediately
 * afterwards, which ends this process.
 * REFS lib/update-queue.ts › queueAddonUpdates() · ./available-updates.tsx
 */
export async function queueAddonUpdatesAction(
  moduleIds: string[],
  helperIds: string[],
  consented: string[],
): Promise<void> {
  await assertSameOrigin();
  const admin = await requirePermission("modules.manage");
  queueAddonUpdates({ moduleIds, helperIds, consented });
  await audit("admin.updates.queued", {
    userId: admin.id,
    detail: `after core: ${[...moduleIds, ...helperIds].join(", ").slice(0, 300) || "none"}`,
  });
}

/**
 * Stage two: apply whatever stage one left behind, from the post-update screen.
 * ⚠ The queue is consumed AS IT IS READ, so a failure is reported once rather than retried on every
 * boot. Items are re-checked against what is available on the NEW version — an update that no
 * longer applies is skipped, not forced.
 * REFS lib/update-queue.ts › takeQueuedAddonUpdates() ·
 * app/(app)/update-complete/continue-addons.tsx
 */
export async function applyQueuedAddonUpdatesAction(): Promise<SelectionState> {
  await assertSameOrigin();
  await requirePermission("modules.manage");

  const pending = takeQueuedAddonUpdates();
  if (!pending) return { error: "Nothing was waiting." };

  const form = new FormData();
  for (const id of pending.helperIds) form.append("helperId", id);
  for (const id of pending.moduleIds) form.append("moduleId", id);
  for (const id of pending.consented) form.append("consent", id);
  return updateSelectedAction({}, form);
}

/** Force a fresh check of core, modules and helpers at once. ⚠ Bypasses every cache, so it is the
 *  button that makes a channel switch or a new release visible immediately.
 *  REFS lib/update.ts › getUpdateStatus(true) · lib/helpers/updates.ts · lib/modules/updates.ts */
export async function checkAllUpdatesAction(): Promise<void> {
  await assertSameOrigin();
  await requirePermission("settings.manage");
  await Promise.allSettled([
    getUpdateStatus(true),
    getModuleUpdateStatus(true),
    getHelperUpdateStatus(true),
  ]);
  revalidatePath("/admin/updates");
}

/**
 * Apply a selection of module and helper updates in ONE rebuild and restart.
 * ⚠ Core is not handled here — it runs through the launcher while these apply in-process, and
 * driving both from one submit can half-apply.
 * ⚠ Helpers go FIRST: a module's new version may need the newer helper, never the reverse.
 * REFS ./module-actions.ts › applyModuleUpdates() · ./helper-actions.ts · ./available-updates.tsx
 */
export async function updateSelectedAction(
  _prev: SelectionState,
  formData: FormData,
): Promise<SelectionState> {
  await assertSameOrigin();
  const admin = await requirePermission("modules.manage");

  const helperIds = formData.getAll("helperId").map(String).filter(Boolean);
  const moduleIds = formData.getAll("moduleId").map(String).filter(Boolean);
  const consented = new Set(formData.getAll("consent").map(String));
  if (helperIds.length === 0 && moduleIds.length === 0) {
    return { error: "Nothing selected." };
  }

  const done: string[] = [];
  const skipped: string[] = [];

  if (helperIds.length > 0) {
    const status = await getHelperUpdateStatus(true);
    const appVersion = getAppVersion();
    for (const id of helperIds) {
      const h = status.helpers.find((x) => x.id === id);
      if (!h || !h.updateAvailable || h.isDowngrade) continue;
      if (h.blockedReason) { skipped.push(`${h.name}: ${h.blockedReason}`); continue; }
      try {
        const channel = (await resolveHelperChannel(id)).channel;
        const manifest = await fetchSourceManifest(DEFAULT_SOURCE_URL, channel);
        const entry = manifest.helpers.find((x) => x.id === id);
        if (!entry || compareVersions(entry.minAppVersion, appVersion) > 0) {
          skipped.push(`${h.name}: not installable on this version of JonDash`);
          continue;
        }
        await installHelper(entry, channel);
        await prisma.helper.update({ where: { id }, data: { version: entry.version, channel } }).catch(() => {});
        done.push(`helper ${id}@${entry.version}`);
      } catch (e) {
        skipped.push(`${h.name}: ${e instanceof Error ? e.message : "update failed"}`);
      }
    }
    invalidateHelperUpdateCache();
  }

  if (moduleIds.length > 0) {
    const res = await applyModuleUpdates(moduleIds, consented);
    done.push(...res.updated.map((id) => `module ${id}`));
    skipped.push(...res.failures);
    clearModuleUpdateCache();
  }

  await audit("admin.updates.apply", {
    userId: admin.id,
    detail: `${done.join(", ") || "nothing applied"}${skipped.length ? ` · skipped ${skipped.join("; ")}` : ""}`.slice(0, 400),
  });

  if (done.length === 0) {
    return { error: skipped.join("; ") || "Nothing could be updated." };
  }

  regenerateRegistry();
  markModuleInstalling(moduleIds);
  requestRebuildAndRestart(); // exits; the launcher rebuilds and restarts
  return { ok: true };
}
