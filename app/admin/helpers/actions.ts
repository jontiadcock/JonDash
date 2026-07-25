"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { getHelperDef } from "@/lib/helpers/registry";
import type { HelperSettingsResult } from "@/lib/helpers/types";

/**
 * The ONLY way a helper's settings are saved.
 *
 * **Why core owns this rather than each helper defining its own action.** A helper is
 * first-party and perfectly capable of calling `requirePermission` itself — but the bug this
 * feature exists to fix was a first-party helper exposing something it should not have.
 * `host-services` put `admin.add` on the surface a *module* could reach, so a module could edit
 * the allowlist that was supposed to bound it: display "Add Plex", submit "sshd". The UAC prompt
 * names the binary and never the service, so nothing on screen caught it.
 *
 * The lesson is not "helpers should remember to check". It is that a check which must be
 * remembered will eventually be forgotten by someone. So the gated path is the only path: this
 * action checks, then dispatches. A helper cannot skip it without writing a server action of its
 * own, which the contract forbids and review can see.
 *
 * What is verified here, before the helper is reached at all:
 *  - **same-origin**, so this cannot be driven from another site;
 *  - **the admin permission**, so a signed-in non-admin cannot reach a helper's settings;
 *  - **that the helper exists and actually declares a handler** — a payload aimed at a helper
 *    that has none is refused rather than silently doing nothing.
 *
 * `ctx.user` is then built from the resolved session. It is not a value any caller supplied,
 * which is exactly the property the old module-supplied context lacked.
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
