import { getCurrentUser } from "@/lib/auth/guards";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { assertSameOrigin } from "@/lib/security/csrf";
import { validateBackupPassphrase } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { serializeBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * Admin-only full server backup download. ⚠ A route, not a server action, because it streams a file
 * — so it carries its own same-origin check and its own permission check rather than inheriting an
 * action's.
 * ⚠ The passphrase is the ONLY way the master key, credentials and secret settings are included,
 * and it is strength-checked: a weak one would encrypt the most sensitive artifact the app
 * produces.
 * REFS lib/backup.ts › serializeBackup() · lib/auth/password.ts › validateBackupPassphrase()
 *      app/admin/backup/ui.tsx — the form  PINS tests/integration/backup.test.ts
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await assertSameOrigin();
  } catch {
    return new Response("Cross-origin request rejected.", { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return new Response("Forbidden", { status: 403 });
  }
  const perms = await getEffectivePermissions(user);
  if (!perms.has("backups.manage")) {
    return new Response("Forbidden", { status: 403 });
  }

  const form = await req.formData();
  const passphrase = (String(form.get("passphrase") ?? "").trim() || null) as string | null;

  /*
   * The checkbox asked for encryption, so a missing passphrase is a fault, not a choice.
   *
   * The page disables the passphrase field when the box is unticked, and a disabled field isn't
   * submitted — which is the intended path. But the *silent* failure here would be handing back an
   * unencrypted archive to someone who ticked "Encrypt this backup", and they would have no way to
   * tell: an unencrypted backup looks identical until the day it can't restore anyone's sign-in.
   * Refuse instead.
   */
  if (form.get("encryptChecked") && !passphrase) {
    return new Response("Encryption was requested but no passphrase was supplied.", { status: 400 });
  }

  if (passphrase) {
    const weak = validateBackupPassphrase(passphrase);
    if (weak) return new Response(weak, { status: 400 });
  }

  const archive = await serializeBackup(passphrase);
  await audit("backup.exported", {
    userId: user.id,
    detail: `full${passphrase ? " (encrypted)" : " (unencrypted — no key/credentials)"}`,
  });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  /*
   * `.dashbk`, not `.zip` — a backup is an artifact you restore, not a folder to rummage in, and
   * the extension stops a double-click scattering the contents.
   * ⚠ Presentation, NOT protection: it is still a ZIP and renaming it opens it. An encrypted backup
   * is protected because everything is inside the ciphertext (BUG-25), never because of its name.
   */
  const filename = `jondash-backup-${stamp}.dashbk`;
  // Copy into a fresh Uint8Array (backed by a plain ArrayBuffer) so it satisfies
  // the Web `BodyInit` type; fflate returns Uint8Array<ArrayBufferLike>.
  return new Response(new Uint8Array(archive), {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
