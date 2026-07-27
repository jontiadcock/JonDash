"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { writeOpenBrowser } from "@/lib/launcher-prefs";

/**
 * Startup behaviour (OPS-06). Full ADMIN only, matching the rest of Server power — it changes
 * what happens on a machine nobody may be sitting at, which is not a delegable thing.
 */
export async function setOpenBrowserAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const open = String(formData.get("open") ?? "") === "true";
  writeOpenBrowser(open);
  await audit("settings.startup.browser", {
    userId: admin.id,
    detail: open ? "open a browser on first launch" : "do not open a browser",
  });
  revalidatePath("/admin/server");
}
