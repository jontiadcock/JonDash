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

export type SelectionState = { ok?: boolean; error?: string };

/** Force a fresh check of all three — core, modules and helpers — in one click. */
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
 * Apply a selection of module and helper updates in ONE rebuild and ONE restart.
 *
 * Core is deliberately not handled here: JonDash's own update runs through the launcher
 * (`/api/update/apply`) while these are applied in-process and exit to rebuild. Driving
 * both from one submit can half-apply, so the UI keeps them apart.
 *
 * Helpers go first — a module's new version may need the newer helper, never the reverse.
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
