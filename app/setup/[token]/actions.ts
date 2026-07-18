"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { verifyTotpEncrypted } from "@/lib/auth/totp";
import { assertSameOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit";
import { generateBackupCodes } from "@/lib/auth/backup-codes";
import { totpCodeSchema } from "@/lib/validation/schemas";

export type SetupState = { error?: string; backupCodes?: string[] };

/** Resolve a valid pending user from a raw setup token, or null. */
export async function findPendingUserByToken(rawToken: string) {
  if (!rawToken) return null;
  const user = await prisma.user.findUnique({
    where: { setupTokenHash: hashToken(rawToken) },
  });
  if (!user) return null;
  if (user.status !== "PENDING_SETUP") return null;
  if (!user.setupTokenExpiresAt || user.setupTokenExpiresAt.getTime() < Date.now()) return null;
  return user;
}

export async function finalizeSetupAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  await assertSameOrigin();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`setup:${ip}`, 10, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const codeParsed = totpCodeSchema.safeParse(formData.get("code"));

  const user = await findPendingUserByToken(token);
  if (!user || !user.totpSecretEnc) {
    return { error: "This setup link is invalid or has expired. Ask your administrator for a new one." };
  }

  const strengthError = validatePasswordStrength(password);
  if (strengthError) return { error: strengthError };
  if (password !== confirm) return { error: "Passwords do not match." };
  if (!codeParsed.success) return { error: "Enter the 6-digit code from your authenticator app." };

  if (!verifyTotpEncrypted(codeParsed.data, user.totpSecretEnc)) {
    return { error: "That code is incorrect. Scan the QR code and try the current code." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mfaEnabled: true,
      status: "ACTIVE",
      setupTokenHash: null,
      setupTokenExpiresAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await audit("account.setup.complete", { userId: user.id });

  // Issue one-time recovery codes so a lost authenticator can't lock them out.
  const backupCodes = await generateBackupCodes(user.id);
  await audit("account.backup_codes.generated", { userId: user.id });

  return { backupCodes };
}
