"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getModuleDef } from "@/lib/modules/registry";
import { enableModule, disableModule, uninstallModule } from "@/lib/modules/manage";
import { moduleSettingsApi } from "@/lib/modules/store";
import { addSource, removeSource, setSourceEnabled, SourceError } from "@/lib/modules/sources";

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

export async function uninstallModuleAction(formData: FormData): Promise<void> {
  await gate();
  const def = defFrom(formData);
  if (!def) return;
  await uninstallModule(def);
  await audit("admin.module.uninstall", { detail: def.id });
  revalidatePath("/admin/modules");
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
