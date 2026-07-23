"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import { fetchSourceManifest, DEFAULT_SOURCE_URL, type ModuleChannel } from "@/lib/modules/sources";
import { installHelper, HelperInstallError } from "@/lib/helpers/install";
import { getHelperUpdateStatus, invalidateHelperUpdateCache } from "@/lib/helpers/updates";
import { resolveHelperChannel } from "@/lib/helpers/channel";
import { regenerateRegistry, markModuleInstalling, requestRebuildAndRestart } from "@/lib/modules/rebuild";
import { getModuleUpdateStatus, clearModuleUpdateCache } from "@/lib/modules/updates";
import { applyModuleUpdates } from "./module-actions";

/**
 * Helper updates and channel pinning (MOD-10).
 *
 * Until now a helper could only change version as a side effect of a module install, so a
 * helper shipping a security fix reached nobody unless a module happened to update too.
 * This is the missing delivery path.
 */

export type HelperUpdateState = { ok?: boolean; error?: string };

async function gate() {
  await assertSameOrigin();
  await requirePermission("modules.manage");
}

export async function checkHelperUpdatesAction(): Promise<void> {
  await gate();
  invalidateHelperUpdateCache();
  await getHelperUpdateStatus(true);
  revalidatePath("/admin/updates");
}

/**
 * Update one or more helpers. Batched: one rebuild and one restart for the set, matching
 * how modules behave — a helper's code is compiled in exactly like a module's.
 *
 * Everything is re-resolved from the official source here, so a tampered form can't change
 * which version lands. `acknowledged` carries the ids whose known-breaking update the admin
 * explicitly accepted; without it a helper that declares `breakingFrom` is refused rather
 * than quietly breaking its consumers.
 */
export async function updateHelpersAction(
  _prev: HelperUpdateState,
  formData: FormData,
): Promise<HelperUpdateState> {
  await gate();

  const ids = [...new Set(formData.getAll("helperId").map(String).filter(Boolean))];
  if (ids.length === 0) return { error: "Choose at least one helper to update." };
  const acknowledged = new Set(formData.getAll("acknowledgeBreaking").map(String));

  const status = await getHelperUpdateStatus(true); // never act on a stale view
  const appVersion = getAppVersion();
  const updated: string[] = [];
  const failures: string[] = [];

  for (const id of ids) {
    const info = status.helpers.find((h) => h.id === id);
    if (!info || !info.latestVersion) {
      failures.push(`${id}: no update is available any more`);
      continue;
    }
    if (info.blockedReason) {
      failures.push(`${info.name}: ${info.blockedReason}`);
      continue;
    }
    // A helper that broke compatibility takes its consumers down with it. Refuse unless
    // the admin was shown which modules and said yes to that specific consequence.
    if (info.breaksModules.length > 0 && !acknowledged.has(id)) {
      failures.push(
        `${info.name}: this version stops ${info.breaksModules.join(", ")} working until updated — confirm first`,
      );
      continue;
    }

    try {
      // Re-fetch rather than trusting the cached status for the artifact itself.
      const channel: ModuleChannel = (await resolveHelperChannel(id)).channel;
      const manifest = await fetchSourceManifest(DEFAULT_SOURCE_URL, channel);
      const entry = manifest.helpers.find((h) => h.id === id);
      if (!entry) {
        failures.push(`${info.name}: no longer published on the ${channel} channel`);
        continue;
      }
      if (compareVersions(entry.minAppVersion, appVersion) > 0) {
        failures.push(`${info.name}: needs JonDash ${entry.minAppVersion} or newer`);
        continue;
      }

      await installHelper(entry, channel);
      await prisma.helper
        .update({ where: { id }, data: { version: entry.version, channel } })
        .catch(() => {}); // row is written at boot; a missing one self-corrects there
      updated.push(`${id}@${entry.version}`);
      await audit("admin.helper.update", {
        detail: `${id} ${info.installedVersion} → ${entry.version} (${channel})`,
      });
    } catch (e) {
      const why =
        e instanceof HelperInstallError ? e.message : e instanceof Error ? e.message : "Update failed.";
      failures.push(`${info.name}: ${why}`);
    }
  }

  if (updated.length === 0) return { error: failures.join(" · ") || "Nothing was updated." };
  if (failures.length > 0) await audit("admin.helper.update.partial", { detail: failures.join(" · ") });

  invalidateHelperUpdateCache();
  regenerateRegistry();
  markModuleInstalling(updated.map((u) => u.split("@")[0]));
  revalidatePath("/admin/updates");
  revalidatePath("/admin/helpers");
  requestRebuildAndRestart();
  return { ok: true };
}

/**
 * Pin a helper to a channel, or clear the pin and return to the derived value.
 *
 * The Helpers page is otherwise read-only by design — a helper is not something you
 * install or remove. A channel pin is the one deliberate exception: it exists so an admin
 * can take a security fix early, or step back off beta, without having to move every
 * module that depends on it.
 */
export async function pinHelperChannelAction(
  _prev: HelperUpdateState,
  formData: FormData,
): Promise<HelperUpdateState> {
  await gate();

  const id = String(formData.get("helperId") ?? "");
  const raw = String(formData.get("channel") ?? "");
  if (!id) return { error: "Which helper?" };

  const pin = raw === "stable" || raw === "beta" ? raw : null; // anything else clears it
  const existing = await prisma.helper.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { error: "That helper isn't installed." };

  await prisma.helper.update({ where: { id }, data: { channelPin: pin } });
  // Re-derive immediately so the page reflects it without waiting for a boot.
  const state = await resolveHelperChannel(id);
  await prisma.helper.update({ where: { id }, data: { channel: state.channel } });

  await audit("admin.helper.channel", {
    detail: pin ? `${id} pinned to ${pin}` : `${id} pin cleared (now ${state.channel})`,
  });
  invalidateHelperUpdateCache();
  revalidatePath("/admin/helpers");
  revalidatePath("/admin/updates");
  return { ok: true };
}

/**
 * "Update everything" — every add-on with an update waiting, in ONE rebuild and restart.
 *
 * Scoped to add-ons on purpose. JonDash's own update is deliberately NOT included: a
 * module can require a newer app version, so the app would have to go first, restart, and
 * only then could the add-ons proceed — and if the app update failed and rolled back, the
 * add-on updates would be running against an app that no longer exists. Two buttons and
 * one clear order beats one button and a failure mode nobody can reason about.
 *
 * Anything needing a decision is SKIPPED and reported, never auto-approved: a module
 * asking for more access than was granted, and a helper whose new version breaks its
 * consumers.
 */
export async function updateEverythingAction(
  _prev: HelperUpdateState,
  _formData: FormData,
): Promise<HelperUpdateState> {
  await gate();

  const [moduleStatus, helperStatus] = await Promise.all([
    getModuleUpdateStatus(true),
    getHelperUpdateStatus(true),
  ]);
  const appVersion = getAppVersion();
  const done: string[] = [];
  const skipped: string[] = [];

  // Helpers first: a module's new version may need the newer helper, and the reverse is
  // never true — a helper doesn't depend on a module.
  for (const h of helperStatus.helpers) {
    if (!h.updateAvailable || !h.latestVersion || h.isDowngrade) continue;
    if (h.blockedReason) {
      skipped.push(`${h.name}: ${h.blockedReason}`);
      continue;
    }
    if (h.breaksModules.length > 0) {
      skipped.push(`${h.name}: would stop ${h.breaksModules.join(", ")} working — update it on its own`);
      continue;
    }
    try {
      const channel = (await resolveHelperChannel(h.id)).channel;
      const manifest = await fetchSourceManifest(DEFAULT_SOURCE_URL, channel);
      const entry = manifest.helpers.find((x) => x.id === h.id);
      if (!entry || compareVersions(entry.minAppVersion, appVersion) > 0) {
        skipped.push(`${h.name}: not installable right now`);
        continue;
      }
      await installHelper(entry, channel);
      await prisma.helper.update({ where: { id: h.id }, data: { version: entry.version, channel } }).catch(() => {});
      done.push(`helper ${h.id}@${entry.version}`);
    } catch (e) {
      skipped.push(`${h.name}: ${e instanceof Error ? e.message : "update failed"}`);
    }
  }

  // Modules that need no decision. Anything asking for MORE access is skipped and named:
  // the consent gate holds identically here — "update everything" is a convenience, never
  // a way past an approval the admin owes.
  const eligible: string[] = [];
  for (const m of moduleStatus.modules) {
    if (!m.updateAvailable || !m.latestVersion || m.isDowngrade) continue;
    if (m.blockedReason) {
      skipped.push(`${m.name}: ${m.blockedReason}`);
      continue;
    }
    if (m.permissionsAdded.length > 0) {
      skipped.push(`${m.name}: asks for more access — approve it separately`);
      continue;
    }
    eligible.push(m.id);
  }

  // Pass an EMPTY consent set: nothing here has been individually approved, and
  // applyModuleUpdates must refuse anything that would need it.
  const moduleIds: string[] = [];
  if (eligible.length > 0) {
    const res = await applyModuleUpdates(eligible, new Set());
    moduleIds.push(...res.updated);
    done.push(...res.updated.map((id) => `module ${id}`));
    skipped.push(...res.failures);
  }

  if (done.length === 0) {
    return { error: skipped.length ? `Nothing could be updated — ${skipped.join(" · ")}` : "Everything is up to date." };
  }

  await audit("admin.update.everything", {
    detail: `${done.join(", ")}${skipped.length ? ` | skipped: ${skipped.join(" · ")}` : ""}`,
  });

  clearModuleUpdateCache();
  invalidateHelperUpdateCache();
  regenerateRegistry();
  markModuleInstalling([...moduleIds, ...done.filter((d) => d.startsWith("helper ")).map((d) => d.slice(7).split("@")[0])]);
  revalidatePath("/admin/updates");
  revalidatePath("/admin/modules");
  requestRebuildAndRestart();
  return { ok: true };
}
