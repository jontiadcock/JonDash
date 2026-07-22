"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import { browseAvailableModules, SourceError } from "@/lib/modules/sources";
import { installModuleFromSource, InstallError } from "@/lib/modules/install";
import { regenerateRegistry, markModuleInstalling, requestRebuildAndRestart } from "@/lib/modules/rebuild";
import { getModuleUpdateStatus, clearModuleUpdateCache } from "@/lib/modules/updates";

export type ModuleUpdateState = { ok?: boolean; error?: string };

async function gate() {
  await assertSameOrigin();
  await requirePermission("modules.manage");
}

/** Re-check now, ignoring the cache (also used after the app itself updates). */
export async function checkModuleUpdatesAction(): Promise<void> {
  await gate();
  clearModuleUpdateCache();
  await getModuleUpdateStatus(true);
  revalidatePath("/admin/updates");
}

/**
 * Update one or more modules.
 *
 * Batched deliberately: five modules is ONE rebuild and ONE restart, not five. Everything
 * is re-resolved from the source here, so a tampered form can't change which version gets
 * installed or understate what it asks for.
 *
 * **Permission changes are consented, never inherited.** `grantedPermissions` is only
 * written at enable, so without this an updated module either silently gains access the
 * admin never approved, or (more often) is denied a capability its new code needs and
 * misbehaves with no explanation. Any module whose new version ADDS a permission must be
 * named in `consented`, and grants are rewritten to the new declared set as part of
 * applying. Permissions only removed need no confirmation — losing access is never a
 * surprise worth interrupting for.
 */
export async function updateModulesAction(
  _prev: ModuleUpdateState,
  formData: FormData,
): Promise<ModuleUpdateState> {
  await gate();

  const ids = formData.getAll("moduleId").map(String).filter(Boolean);
  const consented = new Set(formData.getAll("consent").map(String));
  if (ids.length === 0) return { error: "Select at least one module to update." };

  const status = await getModuleUpdateStatus(true); // never act on a stale view
  const appVersion = getAppVersion();
  const updated: string[] = [];
  const failures: string[] = [];

  for (const id of ids) {
    const info = status.modules.find((m) => m.id === id);
    if (!info || !info.latestVersion) {
      failures.push(`${id}: no update is available any more`);
      continue;
    }
    if (info.blockedReason) {
      failures.push(`${info.name}: ${info.blockedReason}`);
      continue;
    }
    if (info.permissionsAdded.length > 0 && !consented.has(id)) {
      failures.push(`${info.name}: needs your approval for the extra access it asks for`);
      continue;
    }

    try {
      const { modules } = await browseAvailableModules(info.channel);
      const entry = modules.find((m) => m.id === id && m.sourceUrl === info.sourceUrl);
      if (!entry) {
        failures.push(`${info.name}: no longer published by ${info.sourceName}`);
        continue;
      }
      if (compareVersions(entry.minAppVersion, appVersion) > 0) {
        failures.push(`${info.name}: needs JonDash ${entry.minAppVersion} or newer`);
        continue;
      }

      // An update is an install over the top: files are staged then swapped, and the
      // module's own tables and stored data are left untouched.
      await installModuleFromSource(entry.sourceUrl, entry, info.channel);

      // The verifier has just confirmed the package's code declares exactly these, so
      // this is the set the admin was shown and approved.
      await prisma.module.updateMany({
        where: { id },
        data: {
          version: entry.version,
          name: entry.name || info.name,
          grantedPermissions: JSON.stringify(entry.permissions),
        },
      });

      updated.push(id);
      await audit("admin.module.update", {
        detail: `${id} ${info.installedVersion} -> ${entry.version} (${info.channel})${
          info.permissionsAdded.length ? ` +perms: ${info.permissionsAdded.join(",")}` : ""
        }`,
      });
    } catch (e) {
      const why = e instanceof InstallError || e instanceof SourceError ? e.message : "couldn't be updated";
      failures.push(`${info.name}: ${why}`);
    }
  }

  if (updated.length === 0) {
    return { error: failures.join(" · ") || "Nothing was updated." };
  }
  if (failures.length > 0) {
    await audit("admin.module.update.partial", { detail: failures.join(" · ") });
  }

  clearModuleUpdateCache();
  regenerateRegistry();
  markModuleInstalling(updated); // a bad update is rolled back by the launcher
  revalidatePath("/admin/updates");
  revalidatePath("/admin/modules");
  requestRebuildAndRestart(); // exits; the launcher rebuilds and restarts
  return { ok: true };
}
