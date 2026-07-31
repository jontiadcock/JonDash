"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { getHelperDef } from "@/lib/helpers/registry";
import type { HelperSettingsResult } from "@/lib/helpers/types";

/**
 * ⚠ **The ONLY way a helper's settings are saved.** Core owns this rather than each helper defining
 *   its own action, because the bug this feature fixes was a first-party helper exposing something
 *   it should not: a module could edit the allowlist meant to bound it, displaying one service and
 *   submitting another. **A check that must be remembered is eventually forgotten**, so the gated
 *   path is the only path.
 *
 * Verified before the helper is reached: same-origin · the admin permission · that the helper
 * exists and declares a handler, so a payload aimed at one without is refused rather than silently
 * ignored. `ctx.user` is then built from the resolved session, never from a caller.
 *
 * REFS lib/helpers/types.ts › onSettingsSubmit, SettingsPanel — the contract this enforces
 *      app/admin/permissions/actions.ts — the scope edits that route through here too
 */
export async function saveHelperSettingsAction(
  helperId: string,
  payload: Record<string, unknown>,
): Promise<HelperSettingsResult> {
  await assertSameOrigin();
  const admin = await requirePermission("modules.manage");

  const def = getHelperDef(String(helperId));
  if (!def) return { ok: false, error: "That helper isn't installed." };
  if (!def.onSettingsSubmit) return { ok: false, error: `${def.name} doesn't accept settings.` };

  let result: HelperSettingsResult;
  try {
    result = await def.onSettingsSubmit(
      {
        helperId: def.id,
        user: { id: admin.id, email: admin.email, role: admin.role },
      },
      payload && typeof payload === "object" ? payload : {},
    );
  } catch (e) {
    // A helper that throws must not present as a blank screen. Report it as a failure the admin
    // can act on, and record it — a settings change that half-happened is worth knowing about.
    const message = e instanceof Error ? e.message : String(e);
    await audit("admin.helper.settings.error", { userId: admin.id, detail: `${def.id}: ${message}` });
    return { ok: false, error: `${def.name} could not apply that change: ${message}` };
  }

  // Audited whatever the outcome. These changes govern what a helper is allowed to do — a
  // refused attempt is as worth recording as an accepted one.
  await audit("admin.helper.settings", {
    userId: admin.id,
    detail: `${def.id} → ${result.ok ? "applied" : `refused: ${result.error}`}`,
  });

  revalidatePath("/admin/helpers");
  return result;
}
