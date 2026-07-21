"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { verifyStepUp } from "@/lib/auth/stepup";
import { audit } from "@/lib/audit";
import {
  parseBackup,
  applyRestore,
  BackupError,
  CATEGORY_LABELS,
  BACKUP_CATEGORIES,
  type BackupCategory,
} from "@/lib/backup";

export type ImportState = { error?: string; success?: string; notices?: string[] };

const CONFIRM_PHRASE = "Everything";

/**
 * Restore from a backup file. Selective (the admin picks which categories to apply)
 * and a major destructive action:
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
  const selected = formData
    .getAll("categories")
    .map(String)
    .filter((c): c is BackupCategory => (BACKUP_CATEGORIES as readonly string[]).includes(c));

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
  // Apply only what the admin chose AND the backup actually contains.
  const toApply = parsed.includes.filter((c) => selected.includes(c));
  if (toApply.length === 0) {
    return { error: "Choose at least one thing to restore that this backup contains." };
  }

  try {
    await applyRestore(parsed.data, toApply, parsed.iconFiles);
  } catch {
    return { error: "Restore failed and was rolled back. Your current data is unchanged." };
  }

  const summary = toApply.map((c) => CATEGORY_LABELS[c]).join(", ");
  await audit("backup.restored", { detail: summary });

  // Notices the admin should act on.
  const notices: string[] = [];
  const hadCredentials = !!parsed.data.users?.some((u) => !!u.credentials);
  if (toApply.includes("users") && !hadCredentials) {
    notices.push(
      "User accounts were restored without sign-in credentials (the backup wasn’t encrypted). " +
        "Each user must set up again via a setup link (Users → Reset access).",
    );
  }
  if (toApply.includes("settings") && parsed.data.settings?.some((s) => s.secret) && !toApply.includes("users")) {
    notices.push(
      "Secret settings (e.g. email) were skipped — restore Users too (to adopt the backup’s key), or re-enter them.",
    );
  }
  if (toApply.includes("config")) {
    notices.push(
      "Server configuration was restored. Restart the server (Settings → Server power) to apply network/HTTPS changes; if you changed the port, reconnect at the new address.",
    );
  }

  // If accounts were replaced, this admin's session is gone — send to login. The key
  // was adopted + reloaded in-process, so the restored authenticator works there.
  if (toApply.includes("users")) {
    redirect("/login");
  }

  revalidatePath("/admin/backup");
  return { success: `Restored: ${summary}.`, notices: notices.length ? notices : undefined };
}
