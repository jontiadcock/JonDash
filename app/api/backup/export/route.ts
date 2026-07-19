import { getCurrentUser } from "@/lib/auth/guards";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import {
  serializeBackup,
  BACKUP_CATEGORIES,
  type BackupCategory,
} from "@/lib/backup";

export const dynamic = "force-dynamic";

/** Admin-only backup download. Posted from the admin Backup page. */
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
  const categories = form
    .getAll("categories")
    .map(String)
    .filter((c): c is BackupCategory => (BACKUP_CATEGORIES as readonly string[]).includes(c));
  const passphrase = (String(form.get("passphrase") ?? "").trim() || null) as string | null;

  if (categories.length === 0) {
    return new Response("Choose at least one thing to export.", { status: 400 });
  }
  // Accounts/credentials may only leave the server encrypted.
  if (categories.includes("users") && !passphrase) {
    return new Response("A passphrase is required to export user accounts.", { status: 400 });
  }

  const json = await serializeBackup(categories, passphrase);
  await audit("backup.exported", {
    userId: user.id,
    detail: `${categories.join(",")}${passphrase ? " (encrypted)" : ""}`,
  });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `jondash-backup-${stamp}.json`;
  return new Response(json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
