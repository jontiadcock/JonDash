"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getCurrentSession } from "@/lib/auth/session";
import { consumeTotpForUser } from "@/lib/auth/totp";
import { verifyPassword, hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { generateBackupCodes } from "@/lib/auth/backup-codes";
import { assertSameOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit";

export type RegenState = { error?: string; backupCodes?: string[] };

/** Regenerate the current user's recovery codes (requires a current TOTP code). */
export async function regenerateBackupCodesAction(
  _prev: RegenState,
  formData: FormData,
): Promise<RegenState> {
  await assertSameOrigin();
  const user = await requireUser();

  if (!rateLimit(`backup-regen:${user.id}`, 5, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }
  if (!user.totpSecretEnc) {
    return { error: "Two-factor authentication is not set up on this account." };
  }

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code) || !(await consumeTotpForUser(user, code))) {
    return { error: "That authenticator code is incorrect." };
  }

  const backupCodes = await generateBackupCodes(user.id);
  await audit("account.backup_codes.regenerated", { userId: user.id });
  revalidatePath("/account");
  return { backupCodes };
}

export type ChangePwState = { error?: string; success?: string };

/**
 * Change the signed-in user's password. Requires the current password; on
 * success, signs out the user's OTHER sessions (keeps this one).
 */
export async function changePasswordAction(
  _prev: ChangePwState,
  formData: FormData,
): Promise<ChangePwState> {
  await assertSameOrigin();
  const user = await requireUser();

  if (!rateLimit(`change-pw:${user.id}`, 5, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }
  if (!user.passwordHash) {
    return { error: "This account has no password set." };
  }

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!(await verifyPassword(user.passwordHash, current))) {
    await audit("account.password.change.fail", { userId: user.id });
    return { error: "Your current password is incorrect." };
  }
  const strengthError = validatePasswordStrength(next);
  if (strengthError) return { error: strengthError };
  if (next !== confirm) return { error: "New passwords do not match." };
  if (next === current) return { error: "Choose a password different from your current one." };

  const passwordHash = await hashPassword(next);
  const current_session = await getCurrentSession();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({
      where: { userId: user.id, id: { not: current_session?.id ?? "" } },
    }),
  ]);
  await audit("account.password.changed", { userId: user.id });
  revalidatePath("/account");
  return { success: "Password changed. Your other sessions have been signed out." };
}

/** Revoke one of the current user's own sessions. */
export async function revokeOwnSessionAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  // Scope strictly to the caller's own sessions (no IDOR).
  const res = await prisma.session.deleteMany({ where: { id: sessionId, userId: user.id } });
  if (res.count > 0) await audit("session.revoked.self", { userId: user.id });
  revalidatePath("/account");
}
