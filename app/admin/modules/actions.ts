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
import { answersFor, collectUninstallQuestions } from "@/lib/uninstall-questions";
import type { AttributedQuestion } from "@/lib/uninstall-questions";
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

/** REFS app/admin/modules/ui.tsx — the toggle that posts here. */
export async function enableModuleAction(formData: FormData): Promise<void> {
  await gate();
  const def = defFrom(formData);
  if (!def) return;
  await enableModule(def);
  await audit("admin.module.enable", { detail: `${def.id}@${def.version}` });
  revalidatePath("/admin/modules");
}

/** REFS app/admin/modules/ui.tsx — the same toggle. */
export async function disableModuleAction(formData: FormData): Promise<void> {
  await gate();
  const def = defFrom(formData);
  if (!def) return;
  await disableModule(def);
  await audit("admin.module.disable", { detail: def.id });
  revalidatePath("/admin/modules");
}

/**
 * Purge the module's data and delete its source, then rebuild so its code is no longer compiled in.
 * The rebuild restarts the server (graceful, sessions survive), which the confirm step warns about.
 *
 * REFS app/admin/modules/ui.tsx — the caller · app/admin/modules/uninstall-questions.tsx — collects
 *      the answers read below · lib/helpers/install.ts › pruneUnusedHelpers()
 * PINS tests/integration/module-bulk.test.ts
 */
export async function uninstallModuleAction(formData: FormData): Promise<void> {
  await gate();
  // One or many: a batch costs a SINGLE rebuild and restart. Three modules used to mean three
  // restarts and three sign-outs.
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const defs = ids.map((id) => getModuleDef(id)).filter((d): d is NonNullable<typeof d> => !!d);
  if (defs.length === 0) return;

  // ⚠ Namespaced `<kind>:<id>:<questionId>` so one module cannot read or forge an answer belonging
  // to another, or to a helper. REFS lib/uninstall-questions.ts
  const ticked = formData.getAll("answer").map(String).filter(Boolean);

  for (const def of defs) {
    // purge data first, while its definition is still loadable
    await uninstallModule(def, answersFor("module", def.id, ticked));
    await audit("admin.module.uninstall", { detail: def.id });
    removeModuleFiles(def.id);
  }

  // ⚠ FILES ONLY — a pruned helper keeps its data, so reinstalling brings it back with its history.
  // Awaited so it can first release what it created outside JonDash — an OS grant, a task.
  const droppedHelpers = await pruneUnusedHelpers(defs.map((d) => d.id), ticked);
  if (droppedHelpers.length > 0) {
    await audit("admin.helper.remove", { detail: `${droppedHelpers.join(", ")} (no longer needed)` });
  }

  regenerateRegistry();
  revalidatePath("/admin/modules");
  requestRebuildAndRestart(); // exits the process; the launcher rebuilds and restarts
}

// ---- Install / import (Phase 2 chunk B) ----

/** REFS the install and import forms under app/admin/modules/ — four callers render this. */
export type InstallState = { ok?: boolean; error?: string };

/**
 * Resolve the helpers a freshly-written module declares, rolling it back if any cannot be had.
 *
 * ⚠ **A module without its declared helper cannot work, and fails silently.** For a scheduler-style
 *   helper it imports nothing, so the build succeeds and the module just sits there with its work
 *   never running. Both install paths refuse it rather than one keeping it and the other not.
 * ⚠ `existedBefore` makes rollback safe: on an UPDATE the files are already overwritten, so
 *   deleting them would destroy a working module over a missing helper. Report and keep instead.
 * REFS lib/helpers/install.ts — fetches them, official source only
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
 * Install from a configured source. ⚠ The form identifies only WHICH module — version, tag and
 * permissions are re-resolved from the source here, so a tampered form cannot install a different
 * package or understate what it asks for.
 *
 * REFS app/admin/modules/browse/[id]/module-actions.tsx · browse/queued-install-bar.tsx — callers
 *      lib/modules/sources.ts › browseAvailableModules() — where the re-resolution reads from
 * PINS tests/unit/browse-consent.test.ts
 */
export async function installModuleAction(_prev: InstallState, formData: FormData): Promise<InstallState> {
  await gate();
  // The form posts one "moduleId" per selected module, so a batch costs a single restart.
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

      // Declared helpers arrive in the same batch and restart, official source only. See
      // resolveHelpersOrRollBack above for why a missing one rolls the module back.
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

/**
 * Import a ZIP the admin supplies — same verification, no source needed.
 * REFS app/admin/modules/import-form.tsx — the only caller
 */
export async function importModuleAction(_prev: InstallState, formData: FormData): Promise<InstallState> {
  await gate();
  const file = formData.get("package");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a module .zip file to import." };
  if (file.size > 16 * 1024 * 1024) return { error: "That package is too large." };

  let installedId: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Replacing an existing module decides whether a helper failure may roll these files back.
    const peeked = peekZipModuleId(bytes);
    const existedBefore = peeked ? moduleFilesExist(peeked) : false;

    const outcome = await installModuleFromZip(bytes);
    installedId = outcome.moduleId;
    await audit("admin.module.import", { detail: `${outcome.moduleId}@${outcome.version} (${outcome.fileCount} files)` });

    // ⚠ Importing your own module does NOT let you bring your own helper — still official source
    // only. No manifest means no channel, so the admin's own update channel decides.
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
 * Rebuild so helpers healed by the reconcile pass become active — their files are on disk, but a
 * helper is a compile-time import. ⚠ Deliberately explicit: healing files quietly is fine, signing
 * everyone out is not.
 *
 * REFS app/admin/modules/helper-gap-notice.tsx — the only caller · lib/helpers/reconcile.ts — heals
 */
export async function rebuildForHelpersAction(): Promise<void> {
  await gate();
  await audit("admin.helper.activate", { detail: "rebuild requested to activate restored helpers" });
  regenerateRegistry();
  revalidatePath("/admin/modules");
  requestRebuildAndRestart(); // exits; the launcher rebuilds and restarts
}

/** REFS app/admin/modules/failed-notice.tsx — the only caller. */
export async function dismissFailedModuleAction(_prev: InstallState, _formData: FormData): Promise<InstallState> {
  await gate();
  clearFailedModule();
  revalidatePath("/admin/modules");
  return { ok: true };
}

/**
 * Shared tail of both install paths. ⚠ **Never returns** — the process exits so the supervisor
 * restarts it. `markModuleInstalling` lets the launcher remove the module if the build fails.
 *
 * REFS scripts/gen-module-registry.mjs — regenerated here · scripts/supervise.mjs — restarts
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

/** REFS app/admin/modules/sources/ui.tsx — the only caller. */
export type SourceState = { ok?: boolean; error?: string };

/** REFS app/admin/modules/sources/ui.tsx — the only caller. */
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

/** REFS app/admin/modules/sources/ui.tsx — the only caller. */
export async function removeSourceAction(formData: FormData): Promise<void> {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // ⚠ The official source can be disabled, never deleted. Checked here because a hidden button is a
  // suggestion, not a control. REFS lib/modules/sources.ts › isOfficialSource()
  const source = await prisma.moduleSource.findUnique({ where: { id }, select: { isDefault: true } });
  if (source?.isDefault) return;
  await removeSource(id);
  await audit("admin.module.source.remove", { detail: id });
  revalidatePath("/admin/modules/sources");
  revalidatePath("/admin/modules");
}

/** REFS app/admin/modules/sources/ui.tsx — the only caller. */
export async function toggleSourceAction(formData: FormData): Promise<void> {
  await gate();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;
  await setSourceEnabled(id, enabled);
  revalidatePath("/admin/modules/sources");
  revalidatePath("/admin/modules");
}

/**
 * Per-module release channel — "opt into beta releases for this module".
 * REFS app/admin/updates/beta-channels.tsx — the caller
 * PINS tests/unit/update-cache-invalidation.test.ts
 */
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
  // ⚠ BOTH caches: the update comes from the other channel's manifest AND helper channels are
  // re-derived. Leaving either shows the pre-change answer for three minutes.
  clearModuleUpdateCache();
  invalidateHelperUpdateCache();
  revalidatePath(`/admin/modules/${id}`);
  revalidatePath("/admin/modules");
  revalidatePath("/admin/helpers");
  // ⚠ A write that changes what another page shows must invalidate that page (BUG-34) — the Beta
  // channels panel lives here. REFS app/admin/updates/beta-channels.tsx
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
/** REFS app/admin/updates/schedule-actions.ts — the only caller. */
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

/** REFS app/admin/modules/[id]/ui.tsx · app/admin/modules/[id]/groups-form.tsx — both forms. */
export type ModuleSettingsState = { ok?: boolean; error?: string };

/**
 * Limit a module to Service Groups (module RBAC). No groups means visible to everyone signed in,
 * which is the behaviour when the feature is unused. ⚠ Only real group ids are accepted, so a
 * crafted form cannot attach a module to something that does not exist.
 *
 * REFS app/admin/modules/[id]/groups-form.tsx — the only caller
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

/** REFS app/admin/modules/[id]/ui.tsx — the only caller; renders the module's declared fields. */
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

/**
 * Questions for the uninstall confirmation — the modules being removed, plus any helper the removal
 * would prune. ⚠ Called the moment the admin opens the confirmation, because `onUninstall` runs
 * headless and far too late to ask a person anything.
 *
 * REFS app/admin/modules/uninstall-questions.tsx — the caller · lib/uninstall-questions.ts
 */
export async function uninstallQuestionsAction(ids: string[]): Promise<AttributedQuestion[]> {
  await gate();
  return collectUninstallQuestions(ids.filter(Boolean).map(String));
}
