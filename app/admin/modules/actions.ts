"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getModuleDef } from "@/lib/modules/registry";
import { enableModule, disableModule, uninstallModule } from "@/lib/modules/manage";
import { moduleSettingsApi } from "@/lib/modules/store";
import { invalidateHelperUpdateCache } from "@/lib/helpers/updates";
import { clearModuleUpdateCache } from "@/lib/modules/updates";
import {
  addSource,
  removeSource,
  setSourceEnabled,
  SourceError,
  browseAvailableModules,
  type ModuleChannel,
} from "@/lib/modules/sources";
import {
  installModuleFromSource,
  installModuleFromZip,
  removeModuleFiles,
  moduleFilesExist,
  peekZipModuleId,
  InstallError,
} from "@/lib/modules/install";
import {
  regenerateRegistry,
  markModuleInstalling,
  requestRebuildAndRestart,
  clearFailedModule,
} from "@/lib/modules/rebuild";
import { setModuleGroups } from "@/lib/modules/visibility";
import { ensureHelpersFor, pruneUnusedHelpers } from "@/lib/helpers/install";
import { syncAllHelperChannels } from "@/lib/helpers/channel";
import { readChannel } from "@/lib/update-channel";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";

async function gate() {
  await assertSameOrigin();
  await requirePermission("modules.manage");
}

function defFrom(formData: FormData) {
  return getModuleDef(String(formData.get("id") ?? ""));
}

export async function enableModuleAction(formData: FormData): Promise<void> {
  await gate();
  const def = defFrom(formData);
  if (!def) return;
  await enableModule(def);
  await audit("admin.module.enable", { detail: `${def.id}@${def.version}` });
  revalidatePath("/admin/modules");
}

export async function disableModuleAction(formData: FormData): Promise<void> {
  await gate();
  const def = defFrom(formData);
  if (!def) return;
  await disableModule(def);
  await audit("admin.module.disable", { detail: def.id });
  revalidatePath("/admin/modules");
}

/**
 * Uninstall: purge the module's data AND delete its source, then rebuild so its code is
 * no longer compiled in. The rebuild restarts the server (and signs everyone out), which
 * the confirm step warns about.
 */
export async function uninstallModuleAction(formData: FormData): Promise<void> {
  await gate();
  // One or many: like install, a batch costs a SINGLE rebuild + restart rather than one
  // per module. Removing three modules used to mean three restarts and three sign-outs.
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const defs = ids.map((id) => getModuleDef(id)).filter((d): d is NonNullable<typeof d> => !!d);
  if (defs.length === 0) return;

  for (const def of defs) {
    await uninstallModule(def); // purge data first, while its definition is still loadable
    await audit("admin.module.uninstall", { detail: def.id });
    removeModuleFiles(def.id);
  }

  // A helper exists only to serve a module. With its last dependent gone it's removed —
  // FILES ONLY. Its data stays, so reinstalling the module brings the helper back with
  // its history intact rather than starting from nothing.
  const droppedHelpers = pruneUnusedHelpers(defs.map((d) => d.id));
  if (droppedHelpers.length > 0) {
    await audit("admin.helper.remove", { detail: `${droppedHelpers.join(", ")} (no longer needed)` });
  }

  regenerateRegistry();
  revalidatePath("/admin/modules");
  requestRebuildAndRestart(); // exits the process; the launcher rebuilds and restarts
}

// ---- Install / import (Phase 2 chunk B) ----

export type InstallState = { ok?: boolean; error?: string };

/**
 * Resolve the helpers a freshly-written module declares, rolling the module back if any
 * can't be had.
 *
 * A module without its declared helper **cannot work** — for a scheduler-style helper it
 * imports nothing, so the build succeeds and the module simply sits there, its scheduled
 * work never running. Leaving that installed produces exactly the failure this project
 * keeps hitting: something that looks fine and silently does nothing. So both install
 * paths refuse it rather than one keeping it and the other abandoning its files.
 *
 * `existedBefore` is the guard that makes rollback safe: on an UPDATE the files have
 * already been overwritten, and deleting them would destroy a working module over a
 * missing helper. There we report and keep the new version instead.
 *
 * Returns an error string, or null on success.
 */
async function resolveHelpersOrRollBack(
  moduleId: string,
  declaredHelpers: string[],
  channel: ModuleChannel,
  existedBefore: boolean,
): Promise<string | null> {
  if (declaredHelpers.length === 0) return null;

  const res = await ensureHelpersFor(declaredHelpers, channel);
  if (res.installed.length > 0) {
    await audit("admin.helper.install", {
      detail: `${res.installed.map((h) => `${h.id}@${h.version}`).join(", ")} (for ${moduleId})`,
    });
  }
  if (res.missing.length === 0) return null;

  const why = `needs the ${res.missing.map((m) => `"${m}"`).join(", ")} helper, which isn't published on the ${channel} channel`;
  if (existedBefore) return why; // an update — keep what's there rather than destroying it
  removeModuleFiles(moduleId); // fresh install: leave nothing behind for a later rebuild
  return why;
}

/**
 * Install a module from one of the configured sources. The posted form only identifies
 * WHICH module — the version, tag and permissions are re-resolved from the source here,
 * so a tampered form can't install a different package or understate what it asks for.
 */
export async function installModuleAction(_prev: InstallState, formData: FormData): Promise<InstallState> {
  await gate();
  // One or many: the form posts a "moduleId" per selected module, so a batch costs a
  // single rebuild + restart instead of one per module.
  const ids = formData.getAll("moduleId").map(String).filter(Boolean);
  const sourceId = String(formData.get("sourceId") ?? "");
  const channel = String(formData.get("channel") ?? "") === "beta" ? "beta" : "stable";
  if (ids.length === 0) return { error: "Select at least one module to install." };

  const installed: string[] = [];
  const failures: string[] = [];

  const { modules } = await browseAvailableModules(channel).catch(() => ({ modules: [] }));

  for (const moduleId of ids) {
    try {
      // Re-resolved from the source, so a tampered form can't change WHAT gets installed.
      const entry = modules.find(
        (m) => m.id === moduleId && (!sourceId || m.sourceId === sourceId),
      );
      if (!entry) {
        failures.push(`${moduleId}: no longer published by this source`);
        continue;
      }
      if (compareVersions(entry.minAppVersion, getAppVersion()) > 0) {
        failures.push(`${moduleId}: needs JonDash ${entry.minAppVersion} or newer`);
        continue;
      }
      const existedBefore = moduleFilesExist(moduleId);
      const outcome = await installModuleFromSource(entry.sourceUrl, entry, channel);

      // Helpers the module declared arrive with it — same batch, same restart, official
      // source only. If one can't be had the module is rolled back rather than installed
      // in a state where it can never work; the import path does exactly the same.
      const helperError = await resolveHelpersOrRollBack(
        outcome.moduleId,
        outcome.declaredHelpers,
        channel,
        existedBefore,
      );
      if (helperError) {
        failures.push(`${entry.name}: ${helperError}`);
        continue;
      }

      installed.push(outcome.moduleId);
      await audit("admin.module.install", {
        detail: `${outcome.moduleId}@${outcome.version} from ${entry.sourceUrl} (${channel})`,
      });
    } catch (e) {
      const why = e instanceof InstallError || e instanceof SourceError ? e.message : "couldn't be installed";
      failures.push(`${moduleId}: ${why}`);
    }
  }

  // Nothing landed — stay put and explain, rather than restarting for no reason.
  if (installed.length === 0) {
    return { error: failures.join(" · ") || "Couldn't install that module." };
  }
  // Some landed: install what worked and report the rest after the restart.
  if (failures.length > 0) {
    await audit("admin.module.install.partial", { detail: failures.join(" · ") });
  }
  return finishInstall(installed);
}

/** Import a module the admin supplies as a ZIP — same verification, no source needed. */
export async function importModuleAction(_prev: InstallState, formData: FormData): Promise<InstallState> {
  await gate();
  const file = formData.get("package");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a module .zip file to import." };
  if (file.size > 16 * 1024 * 1024) return { error: "That package is too large." };

  let installedId: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Whether these files are replacing an existing module decides whether a helper
    // failure may roll them back — see resolveHelpersOrRollBack.
    const peeked = peekZipModuleId(bytes);
    const existedBefore = peeked ? moduleFilesExist(peeked) : false;

    const outcome = await installModuleFromZip(bytes);
    installedId = outcome.moduleId;
    await audit("admin.module.import", { detail: `${outcome.moduleId}@${outcome.version} (${outcome.fileCount} files)` });

    // A sideloaded module declaring a helper needs it just as much as an installed one.
    // The helper still comes only from the official source — importing your own module
    // doesn't let you bring your own helper. A sideloaded package has no manifest and so
    // no channel of its own, so the admin's own update channel decides: someone on stable
    // shouldn't silently receive beta helper code.
    const helperError = await resolveHelpersOrRollBack(
      outcome.moduleId,
      outcome.declaredHelpers,
      readChannel() === "beta" ? "beta" : "stable",
      existedBefore,
    );
    if (helperError) return { error: `That module ${helperError}.` };
  } catch (e) {
    if (e instanceof InstallError) return { error: e.message };
    return { error: "Couldn't import that module." };
  }

  return finishInstall([installedId]);
}

/**
 * Rebuild so helpers healed by the reconcile pass become active.
 *
 * Their files are already on disk; a helper is a compile-time import, so only a rebuild
 * makes it real. Deliberately an explicit action rather than something the heal does on
 * its own — the files healing quietly is fine, signing everyone out is not.
 */
export async function rebuildForHelpersAction(): Promise<void> {
  await gate();
  await audit("admin.helper.activate", { detail: "rebuild requested to activate restored helpers" });
  regenerateRegistry();
  revalidatePath("/admin/modules");
  requestRebuildAndRestart(); // exits; the launcher rebuilds and restarts
}

/** Acknowledge the "a module was removed to get the app running" notice. */
export async function dismissFailedModuleAction(_prev: InstallState, _formData: FormData): Promise<InstallState> {
  await gate();
  clearFailedModule();
  revalidatePath("/admin/modules");
  return { ok: true };
}

/**
 * Shared tail of both install paths: regenerate the registry, note which module is being
 * installed (so the launcher can remove it if the build fails), and hand over for the
 * rebuild. Never returns — the process exits so the supervisor can restart it.
 */
function finishInstall(moduleIds: string[]): InstallState {
  regenerateRegistry();
  markModuleInstalling(moduleIds);
  revalidatePath("/admin/modules");
  revalidatePath("/admin/modules/browse");
  requestRebuildAndRestart();
  return { ok: true };
}

// ---- Module sources (Phase 2) ----

export type SourceState = { ok?: boolean; error?: string };

export async function addSourceAction(_prev: SourceState, formData: FormData): Promise<SourceState> {
  await gate();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "Enter the source's GitHub repository URL." };
  try {
    const created = await addSource(url, String(formData.get("name") ?? ""));
    await audit("admin.module.source.add", { detail: created.url });
  } catch (e) {
    return { error: e instanceof SourceError ? e.message : "Couldn't add that source." };
  }
  revalidatePath("/admin/modules/sources");
  revalidatePath("/admin/modules");
  return { ok: true };
}

export async function removeSourceAction(formData: FormData): Promise<void> {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await removeSource(id);
  await audit("admin.module.source.remove", { detail: id });
  revalidatePath("/admin/modules/sources");
  revalidatePath("/admin/modules");
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  await gate();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;
  await setSourceEnabled(id, enabled);
  revalidatePath("/admin/modules/sources");
  revalidatePath("/admin/modules");
}

/** Per-module release channel ("opt into beta releases for this module"). */
export async function setModuleChannelAction(formData: FormData): Promise<void> {
  await gate();
  const id = String(formData.get("id") ?? "");
  const channel = String(formData.get("channel") ?? "") === "beta" ? "beta" : "stable";
  if (!getModuleDef(id)) return;
  await prisma.module.updateMany({ where: { id }, data: { channel } });
  await audit("admin.module.channel", { detail: `${id} -> ${channel}` });
  // A helper follows the highest channel among its dependents, so moving a module can
  // move a helper with it (MOD-10). Re-derive now rather than waiting for the next boot.
  await syncAllHelperChannels().catch(() => {});
  // BOTH caches. The module's own available update now comes from the other channel's
  // manifest, and moving a module re-derives its helpers' channels — leaving either cached
  // means the page shows the pre-change answer for up to three minutes and the switch looks
  // like it did nothing.
  clearModuleUpdateCache();
  invalidateHelperUpdateCache();
  revalidatePath(`/admin/modules/${id}`);
  revalidatePath("/admin/modules");
  revalidatePath("/admin/helpers");
  // The Beta channels panel lives here and shows this module's channel. This was the only
  // one of its siblings not revalidating it — a write that changes what another page shows
  // has to invalidate that page (BUG-34).
  revalidatePath("/admin/updates");
}

/**
 * Opt ONE module into automatic updates (MOD-10). Off by default.
 *
 * Deliberately per module rather than a single global switch: one tick would give every
 * source — including any public repo added by URL — a standing channel to run new code
 * here. An update that ADDS a permission is never applied automatically whatever this
 * says; consent is not something a preference can waive.
 */
export async function setModuleAutoUpdateAction(formData: FormData): Promise<void> {
  await gate();
  const id = String(formData.get("moduleId") ?? "");
  const on = String(formData.get("autoUpdate") ?? "") === "on";
  if (!getModuleDef(id)) return;
  await prisma.module.updateMany({ where: { id }, data: { autoUpdate: on } });
  await audit("admin.module.autoupdate", { detail: `${id} ${on ? "enabled" : "disabled"}` });
  revalidatePath(`/admin/modules/${id}`);
  revalidatePath("/admin/updates");
}

export type ModuleSettingsState = { ok?: boolean; error?: string };

/**
 * Limit a module to Service Groups (module RBAC). No groups = visible to everyone signed
 * in, which is its behaviour when the feature isn't used. Only real group ids are
 * accepted, so a crafted form can't attach a module to something that doesn't exist.
 */
export async function setModuleGroupsAction(
  _prev: ModuleSettingsState,
  formData: FormData,
): Promise<ModuleSettingsState> {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!getModuleDef(id)) return { error: "Unknown module." };

  const requested = formData.getAll("groupId").map(String).filter(Boolean);
  const real = await prisma.serviceRole.findMany({
    where: { id: { in: requested } },
    select: { id: true },
  });

  await setModuleGroups(id, real.map((g) => g.id));
  await audit("admin.module.groups", {
    detail: `${id} -> ${real.length === 0 ? "everyone" : `${real.length} group(s)`}`,
  });
  revalidatePath(`/admin/modules/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveModuleSettingsAction(
  _prev: ModuleSettingsState,
  formData: FormData,
): Promise<ModuleSettingsState> {
  await gate();
  const def = getModuleDef(String(formData.get("__moduleId") ?? ""));
  if (!def) return { error: "Unknown module." };
  const api = moduleSettingsApi(def);
  for (const f of def.settings ?? []) {
    if (f.type === "boolean") {
      await api.set(f.key, formData.get(f.key) != null); // absent checkbox => false
      continue;
    }
    if (!formData.has(f.key)) continue;
    const raw = String(formData.get(f.key) ?? "");
    if (f.secret && raw === "") continue; // blank secret => keep the existing value
    await api.set(f.key, f.type === "number" ? Number(raw) : raw);
  }
  revalidatePath(`/admin/modules/${def.id}`);
  return { ok: true };
}
