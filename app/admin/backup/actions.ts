"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { verifyStepUp } from "@/lib/auth/stepup";
import { audit } from "@/lib/audit";
import {
  parseBackup,
  inspectBackup,
  applyRestore,
  BackupError,
  CATEGORY_LABELS,
  type BackupInspection,
} from "@/lib/backup";

/** `notices` is what a restore could NOT do — REFS lib/backup.ts › applyRestore(), which returns
 *  it, and app/admin/backup/ui.tsx, which must show it. */
export type ImportState = { error?: string; success?: string; notices?: string[] };

/**
 * Say what a chosen file is, before anyone commits to restoring it — so the form asks for a
 * passphrase only when the file has one, and requires it when it does.
 *
 * ⚠ Admin-gated like the restore itself. It only reads a file the caller supplied, but there is no
 * reason for it to be reachable by anyone who could not restore anyway.
 * REFS lib/backup.ts › inspectBackup() · app/admin/backup/ui.tsx — calls it on selection
 */
export async function inspectBackupAction(formData: FormData): Promise<BackupInspection> {
  await assertSameOrigin();
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a backup file." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "That backup file is too large (10 MB max)." };
  }
  return inspectBackup(new Uint8Array(await file.arrayBuffer()));
}

/**
 * Restore from a backup file — ⚠ everything it contains, all at once. Do not re-add a category
 * picker: the parts of a backup are not independent. Users carry the encryption key that makes
 * their own 2FA secrets and every secret setting readable, so restoring settings without users
 * silently dropped them, and restoring users without roles orphaned memberships. Every combination
 * except "all of it" produced an install subtly unlike the one backed up.
 *
 * ⚠ Still gated by step-up TOTP — this is the most destructive action in the product.
 * REFS lib/auth/stepup.ts › verifyStepUp() · lib/backup.ts › applyRestore()
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
  const totpCode = String(formData.get("totpCode") ?? "");

  // Gate BEFORE touching any data.
  const step = await verifyStepUp({ totpCode });
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

  let report;
  try {
    report = await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);
  } catch {
    return { error: "Restore failed and was rolled back. Your current data is unchanged." };
  }

  const summary = parsed.includes.map((c) => CATEGORY_LABELS[c]).join(", ");
  await audit("backup.restored", { detail: summary });
  // A skipped add-on table is a partial restore. It goes in the audit log as well as on screen,
  // because the person reading the log a month later is the one asking why the data isn't there.
  if (report.skipped.length) {
    await audit("backup.restore.partial", { detail: report.skipped.join(" | ").slice(0, 500) });
  }

  // Notices the admin should act on.
  const notices: string[] = [...report.skipped];
  const hadCredentials = !!parsed.data.users?.some((u) => !!u.credentials);
  if (parsed.includes.includes("users") && !hadCredentials) {
    notices.push(
      "User accounts were restored without sign-in credentials (the backup wasn’t encrypted). " +
        "Each user must set up again via a setup link (Users → Reset access).",
    );
  }
  if (parsed.includes.includes("config")) {
    notices.push(
      "Server configuration was restored. Restart the server (Settings → Server power) to apply network/HTTPS changes; if you changed the port, reconnect at the new address.",
    );
  }

  // If accounts were replaced, this admin's session is gone — send to login. The key
  // was adopted + reloaded in-process, so the restored authenticator works there.
  if (parsed.includes.includes("users")) {
    redirect("/login");
  }

  revalidatePath("/admin/backup");
  return { success: `Restored: ${summary}.`, notices: notices.length ? notices : undefined };
}
