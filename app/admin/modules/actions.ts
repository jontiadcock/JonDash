"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { getModuleDef } from "@/lib/modules/registry";
import { enableModule, disableModule, uninstallModule } from "@/lib/modules/manage";
import { moduleSettingsApi } from "@/lib/modules/store";

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
