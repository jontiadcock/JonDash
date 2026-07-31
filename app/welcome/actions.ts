"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import {
  generateTotpSecret,
  encryptTotpSecret,
  consumeTotpForUser,
} from "@/lib/auth/totp";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit";
import { emailSchema, totpCodeSchema } from "@/lib/validation/schemas";
import { hasActiveAdmin, getPendingAdmin } from "@/lib/auth/bootstrap";
import { generateBackupCodes } from "@/lib/auth/backup-codes";
import { setRevealCodes } from "@/lib/auth/recovery-reveal";
import {
  parseBackup,
  applyRestore,
  inspectBackup,
  BackupError,
  type BackupInspection,
} from "@/lib/backup";

/** REFS ./forms.tsx — the setup form's `useActionState` shape */
export type WelcomeState = { error?: string };
/** REFS ./forms.tsx — the restore form's shape; `notice` carries what a restore could not do */
export type WelcomeRestoreState = { error?: string; notice?: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Step 1: create the first admin and generate a TOTP secret. ⚠ Closed the moment an active admin
 *  exists — that boundary is what stops this being an unauthenticated account-creation endpoint on
 *  a live install. REFS lib/auth/bootstrap.ts › hasActiveAdmin() · ./forms.tsx */
export async function welcomeCreateAction(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  await assertSameOrigin();
  if (await hasActiveAdmin()) redirect("/login");
  if (await getPendingAdmin()) redirect("/welcome");

  if (!rateLimit(`welcome:${await clientIp()}`, 10, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const emailParsed = emailSchema.safeParse(formData.get("email"));
  if (!emailParsed.success) return { error: "Enter a valid email address." };

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const strengthError = validatePasswordStrength(password);
  if (strengthError) return { error: strengthError };
  if (password !== confirm) return { error: "Passwords do not match." };

  const passwordHash = await hashPassword(password);
  const secret = generateTotpSecret();

  await prisma.user.create({
    data: {
      email: emailParsed.data,
      role: "ADMIN",
      status: "PENDING_SETUP",
      passwordHash,
      totpSecretEnc: encryptTotpSecret(secret),
    },
  });

  redirect("/welcome"); // page advances to the TOTP step
}

/** Step 2: confirm TOTP, activate the admin and sign them in. ⚠ The account stays PENDING_SETUP
 *  until the code verifies, so an abandoned step 1 cannot leave a sign-in-able admin.
 *  REFS lib/auth/totp.ts · lib/auth/session.ts · ./forms.tsx */
export async function welcomeConfirmAction(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  await assertSameOrigin();
  if (await hasActiveAdmin()) redirect("/login");

  const admin = await getPendingAdmin();
  if (!admin || !admin.totpSecretEnc) redirect("/welcome");

  if (!rateLimit(`welcome-totp:${admin.id}`, 6, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const codeParsed = totpCodeSchema.safeParse(formData.get("code"));
  if (!codeParsed.success) return { error: "Enter the 6-digit code from your authenticator app." };

  if (!(await consumeTotpForUser(admin, codeParsed.data))) {
    return { error: "That code is incorrect. Scan the QR code and try the current code." };
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { status: "ACTIVE", mfaEnabled: true },
  });
  await audit("admin.bootstrap.complete", { userId: admin.id });
  await createSession(admin.id);

  // Issue one-time recovery codes and show them once before the dashboard.
  const backupCodes = await generateBackupCodes(admin.id);
  await audit("account.backup_codes.generated", { userId: admin.id });
  await setRevealCodes(backupCodes, "/dashboard");
  redirect("/recovery-codes");
}

/**
 * Say whether a chosen backup is encrypted, on the first-run screen.
 *
 * ⚠ Its own action, not the admin one, because this surface has no admin to authenticate — so it
 * must carry exactly the guards the restore beside it carries: closed once an admin exists,
 * same-origin, and the same per-IP rate limit. Relax any of them and it becomes a way to probe a
 * live install. It reveals only what the envelope keeps outside the ciphertext anyway.
 * REFS lib/backup.ts › inspectBackup() · app/admin/backup/actions.ts — the admin equivalent
 */
export async function welcomeInspectAction(formData: FormData): Promise<BackupInspection> {
  await assertSameOrigin();
  if (await hasActiveAdmin()) return { ok: false, error: "This install is already set up." };
  if (!rateLimit(`welcome-inspect:${await clientIp()}`, 10, 60_000).allowed) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a backup file." };
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "That backup file is too large (10 MB max)." };
  }
  return inspectBackup(new Uint8Array(await file.arrayBuffer()));
}

/**
 * First-run alternative: initialise a brand-new install from a backup. ⚠ Available ONLY before the
 * first admin exists — the same boundary that closes the setup wizard — so it can never be an
 * unauthenticated restore of a live install.
 * REFS lib/auth/bootstrap.ts › hasActiveAdmin() · lib/backup.ts › applyRestore()
 * PINS tests/integration/welcome-restore.test.ts
 */
export async function welcomeRestoreAction(
  _prev: WelcomeRestoreState,
  formData: FormData,
): Promise<WelcomeRestoreState> {
  await assertSameOrigin();
  if (await hasActiveAdmin()) redirect("/login"); // closed once set up

  if (!rateLimit(`welcome-restore:${await clientIp()}`, 5, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a backup file to restore." };
  if (file.size > 10 * 1024 * 1024) return { error: "That backup file is too large (10 MB max)." };

  const passphrase = String(formData.get("passphrase") ?? "").trim() || null;

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
    return { error: "Restore failed. Your install is still empty — try again, or set up manually." };
  }
  await audit("bootstrap.restored", { detail: parsed.includes.join(",") });

  // If the backup brought in an active admin, first-run is complete → sign in.
  if (await hasActiveAdmin()) redirect("/login");

  // Restored, but no sign-in-able admin (e.g. a plain backup without accounts).
  return {
    notice:
      "Backup restored, but it didn’t include an administrator account you can sign in with. " +
      "Create your admin account above to finish setting up.",
  };
}

/** Discard the in-progress admin so setup can restart with a new email. ⚠ Same boundary as the
 *  rest of this file — refused once an active admin exists, or it would delete a real account.
 *  REFS lib/auth/bootstrap.ts › hasActiveAdmin() · ./forms.tsx */
export async function welcomeRestartAction(): Promise<void> {
  await assertSameOrigin();
  if (await hasActiveAdmin()) redirect("/login");
  const admin = await getPendingAdmin();
  if (admin) await prisma.user.delete({ where: { id: admin.id } });
  redirect("/welcome");
}
