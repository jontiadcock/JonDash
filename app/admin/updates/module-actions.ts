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
import { parseGrants } from "@/lib/modules/permissions";
import { ensureHelpersFor } from "@/lib/helpers/install";

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
 * Update one or more modules. Batched: five modules is ONE rebuild and restart.
 *
 * ⚠ Everything is re-resolved from the source HERE, so a tampered form cannot change which version
 * lands or understate what it asks for.
 * ⚠ Permission changes are CONSENTED, never inherited: a module whose new version ADDS a permission
 * must be named in `consented`, or it silently gains access the admin never approved. Permissions
 * only removed need no confirmation. REFS lib/modules/permissions.ts · lib/modules/verify.ts
 */
export async function updateModulesAction(
  _prev: ModuleUpdateState,
  formData: FormData,
): Promise<ModuleUpdateState> {
  await gate();

  const ids = formData.getAll("moduleId").map(String).filter(Boolean);
  const consented = new Set(formData.getAll("consent").map(String));
  if (ids.length === 0) return { error: "Select at least one module to update." };

  const { updated, failures } = await applyModuleUpdates(ids, consented);

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

/**
 * Apply module updates and report what happened, WITHOUT rebuilding — so "Update everything" can do
 * modules and helpers in one rebuild rather than duplicating this.
 *
 * ⚠ Every gate here — blocked, added permissions, `minAppVersion`, missing helper — applies
 * identically whichever entry point is used. The caller owns the rebuild, the cache clear and the
 * audit summary. REFS ./helper-actions.ts › updateEverythingAction() · ./selection-actions.ts ·
 *      lib/updates/auto-run.ts — the scheduled path
 */
export async function applyModuleUpdates(
  ids: string[],
  consented: Set<string>,
): Promise<{ updated: string[]; failures: string[] }> {
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
      const outcome = await installModuleFromSource(entry.sourceUrl, entry, info.channel);

      // An update can ADD a helper the previous version didn't need. Without this the
      // module comes back working-but-inert, with nothing explaining why.
      if (outcome.declaredHelpers.length > 0) {
        const res = await ensureHelpersFor(outcome.declaredHelpers, info.channel);
        if (res.installed.length > 0) {
          await audit("admin.helper.install", {
            detail: `${res.installed.map((h) => `${h.id}@${h.version}`).join(", ")} (for ${id})`,
          });
        }
        for (const m of res.missing) {
          failures.push(`${info.name}: needs the "${m}" helper, which isn't published`);
        }
      }

      /*
       * ⚠ BUG-56: never write the declared set wholesale — that silently restores anything the
       * admin revoked on Admin → Permissions. Keep what they hold, drop what this version no longer
       * declares, and add ONLY permissions new in this version that were explicitly consented to
       * above. A revoked permission merely re-declared by a new version stays revoked.
       * REFS lib/modules/permissions.ts › nextGrants() — the same rule on the enable path
       */
      const row = await prisma.module.findUnique({
        where: { id },
        select: { grantedPermissions: true },
      });
      const current = row ? parseGrants(row.grantedPermissions) : [];
      const approvedNow = consented.has(id) ? info.permissionsAdded : [];
      const nextGrants = entry.permissions.filter(
        (p) => current.includes(p) || approvedNow.includes(p),
      );

      await prisma.module.updateMany({
        where: { id },
        data: {
          version: entry.version,
          name: entry.name || info.name,
          grantedPermissions: JSON.stringify(nextGrants),
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

  return { updated, failures };
}
