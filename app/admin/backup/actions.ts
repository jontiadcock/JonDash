"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { verifyStepUp } from "@/lib/auth/stepup";
import { audit } from "@/lib/audit";
import { parseBackup, applyRestore, BackupError, CATEGORY_LABELS } from "@/lib/backup";

export type ImportState = { error?: string; success?: string };

const CONFIRM_PHRASE = "Everything";

/**
 * Restore from a backup file. Major destructive action:
 *  - step-up: a fresh TOTP is required if none in the last 30 minutes;
 *  - the admin must type "Everything" to confirm the full replace.
 */
export async function importBackupAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await assertSameOrigin();
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a backup file to restore." };
  }
  // Keep this at/under the Server Actions body limit (next.config bodySizeLimit)
  // so an oversized file gets this friendly message instead of a framework crash.
  if (file.size > 10 * 1024 * 1024) {
    return { error: "That backup file is too large (10 MB max)." };
  }

  const passphrase = String(formData.get("passphrase") ?? "").trim() || null;
  const typed = String(formData.get("confirm") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "");

  // Gate BEFORE touching any data.
  const step = await verifyStepUp({ typed, phrase: CONFIRM_PHRASE, totpCode });
  if (!step.ok) return { error: step.error };

  let parsed;
  try {
    parsed = parseBackup(new Uint8Array(await file.arrayBuffer()), passphrase);
  } catch (e) {
    return { error: e instanceof BackupError ? e.message : "Could not read that backup file." };
  }

  if (parsed.includes.length === 0) {
    return { error: "That backup doesn’t contain anything to restore." };
  }

  try {
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);
  } catch {
    return { error: "Restore failed and was rolled back. Your current data is unchanged." };
  }

  const summary = parsed.includes.map((c) => CATEGORY_LABELS[c]).join(", ");
  await audit("backup.restored", { detail: summary });

  // If accounts were replaced, this admin's session is gone — send to login.
  if (parsed.includes.includes("users")) {
    redirect("/login");
  }

  revalidatePath("/admin/backup");
  return { success: `Restored: ${summary}.` };
}
