"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import {
  generateTotpSecret,
  encryptTotpSecret,
  verifyTotpEncrypted,
} from "@/lib/auth/totp";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit";
import { emailSchema, totpCodeSchema } from "@/lib/validation/schemas";
import { hasActiveAdmin, getPendingAdmin } from "@/lib/auth/bootstrap";
import { generateBackupCodes } from "@/lib/auth/backup-codes";
import { setRevealCodes } from "@/lib/auth/recovery-reveal";
import { parseBackup, applyRestore, BackupError } from "@/lib/backup";

export type WelcomeState = { error?: string };
export type WelcomeRestoreState = { error?: string; notice?: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Step 1: create the first admin (email + password), generate a TOTP secret. */
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

/** Step 2: confirm TOTP → activate the admin and sign them in. */
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

  if (!verifyTotpEncrypted(codeParsed.data, admin.totpSecretEnc)) {
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
 * First-run alternative: initialise a brand-new install by restoring a backup
 * (e.g. migrating from another machine). Only available before the first admin
 * exists — the same boundary that closes the setup wizard — so it is never an
 * unauthenticated restore of a live install.
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

/** Discard the in-progress admin so setup can be restarted with a new email. */
export async function welcomeRestartAction(): Promise<void> {
  await assertSameOrigin();
  if (await hasActiveAdmin()) redirect("/login");
  const admin = await getPendingAdmin();
  if (admin) await prisma.user.delete({ where: { id: admin.id } });
  redirect("/welcome");
}
