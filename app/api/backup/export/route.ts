import { getCurrentUser } from "@/lib/auth/guards";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { assertSameOrigin } from "@/lib/security/csrf";
import { validateBackupPassphrase } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { serializeBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * Admin-only full server backup download. Posted from the admin Backup page. Always
 * exports everything; an optional passphrase encrypts the archive and is the only way
 * the master key + credentials + secret settings are included (enforced strong).
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
  // `.dashbk`, not `.zip`. A backup is a JonDash artifact you restore, not a folder to
  // rummage in — the extension says so, and stops a double-click scattering the contents.
  // Honest about what it is: still a ZIP inside, and renaming it back to .zip opens it.
  // That is presentation, not protection — an ENCRYPTED backup is protected because
  // everything in it is inside the ciphertext (BUG-25), not because of its name.
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
