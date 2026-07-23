"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { applySettingsFormDetailed, settingKeysByGroup } from "@/lib/settings";

export type ScheduleState = { ok?: boolean; error?: string };

/**
 * When automatic updates run, and what is opted in to them (BUG-30).
 *
 * Kept on the Updates page rather than Settings: until now the channel, the app's own
 * auto-update, per-module auto-update and the module/helper update lists lived in four
 * different places, so "what updates itself, and when" could not be answered from any
 * single screen.
 */

async function gate() {
  await assertSameOrigin();
  return requirePermission("settings.manage");
}

export async function saveUpdateScheduleAction(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const admin = await gate();

  const { errors, changed } = await applySettingsFormDetailed(formData, settingKeysByGroup("updates"));
  if (Object.keys(errors).length > 0) {
    return { error: Object.values(errors)[0] ?? "Check the schedule values." };
  }

  await audit("settings.updates.schedule", {
    userId: admin.id,
    detail: changed.join(", ") || "no change",
  });
  revalidatePath("/admin/updates");
  return { ok: true };
}

/**
 * Opt one helper in or out of automatic updates.
 *
 * Separate from the module toggle on purpose even though the shape is identical: a helper
 * does the privileged work modules are forbidden, so letting one update itself unattended
 * is a bigger trust decision, and the audit entry should say which kind it was.
 */
export async function setHelperAutoUpdateAction(formData: FormData): Promise<void> {
  const admin = await gate();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const on = String(formData.get("autoUpdate") ?? "") === "on";

  await prisma.helper.updateMany({ where: { id }, data: { autoUpdate: on } });
  await audit("admin.helper.autoupdate", {
    userId: admin.id,
    detail: `${id}=${on ? "on" : "off"}`,
  });
  revalidatePath("/admin/updates");
  revalidatePath("/admin/helpers");
}

// The MODULE equivalent deliberately isn't here: `setModuleAutoUpdateAction` already exists
// in app/admin/modules/actions.ts and the toggle reuses it. Two actions writing the same
// column would mean two audit strings and two places to keep a rule in step.
