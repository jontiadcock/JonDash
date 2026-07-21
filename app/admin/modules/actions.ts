"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getModuleDef } from "@/lib/modules/registry";
import { enableModule, disableModule, uninstallModule } from "@/lib/modules/manage";
import { moduleSettingsApi } from "@/lib/modules/store";
import {
  addSource,
  removeSource,
  setSourceEnabled,
  SourceError,
  browseAvailableModules,
} from "@/lib/modules/sources";
import { installModuleFromSource, installModuleFromZip, removeModuleFiles, InstallError } from "@/lib/modules/install";
import {
  regenerateRegistry,
  markModuleInstalling,
  requestRebuildAndRestart,
  clearFailedModule,
} from "@/lib/modules/rebuild";
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
  const def = defFrom(formData);
  if (!def) return;
  await uninstallModule(def);
  await audit("admin.module.uninstall", { detail: def.id });

  removeModuleFiles(def.id);
  regenerateRegistry();
  revalidatePath("/admin/modules");
  requestRebuildAndRestart(); // exits the process; the launcher rebuilds and restarts
}

// ---- Install / import (Phase 2 chunk B) ----

export type InstallState = { ok?: boolean; error?: string };

/**
 * Install a module from one of the configured sources. The posted form only identifies
 * WHICH module — the version, tag and permissions are re-resolved from the source here,
 * so a tampered form can't install a different package or understate what it asks for.
 */
export async function installModuleAction(_prev: InstallState, formData: FormData): Promise<InstallState> {
  await gate();
  const sourceId = String(formData.get("sourceId") ?? "");
  const moduleId = String(formData.get("moduleId") ?? "");
  const channel = String(formData.get("channel") ?? "") === "beta" ? "beta" : "stable";
  if (!sourceId || !moduleId) return { error: "Pick a module to install." };

  let installedId: string;
  try {
    const { modules } = await browseAvailableModules(channel);
    const entry = modules.find((m) => m.id === moduleId && m.sourceId === sourceId);
    if (!entry) return { error: "That module is no longer published by this source." };

    if (compareVersions(entry.minAppVersion, getAppVersion()) > 0) {
      return { error: `That module needs JonDash ${entry.minAppVersion} or newer. Update JonDash first.` };
    }

    const outcome = await installModuleFromSource(entry.sourceUrl, entry, channel);
    installedId = outcome.moduleId;
    await audit("admin.module.install", {
      detail: `${outcome.moduleId}@${outcome.version} from ${entry.sourceUrl} (${channel})`,
    });
  } catch (e) {
    if (e instanceof InstallError || e instanceof SourceError) return { error: e.message };
    return { error: "Couldn't install that module." };
  }

  return finishInstall(installedId);
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
    const outcome = await installModuleFromZip(bytes);
    installedId = outcome.moduleId;
    await audit("admin.module.import", { detail: `${outcome.moduleId}@${outcome.version} (${outcome.fileCount} files)` });
  } catch (e) {
    if (e instanceof InstallError) return { error: e.message };
    return { error: "Couldn't import that module." };
  }

  return finishInstall(installedId);
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
function finishInstall(moduleId: string): InstallState {
  regenerateRegistry();
  markModuleInstalling(moduleId);
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
  revalidatePath(`/admin/modules/${id}`);
  revalidatePath("/admin/modules");
}

export type ModuleSettingsState = { ok?: boolean; error?: string };

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
