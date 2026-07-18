"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { verifyTotpEncrypted } from "@/lib/auth/totp";
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
  if (!/^\d{6}$/.test(code) || !verifyTotpEncrypted(code, user.totpSecretEnc)) {
    return { error: "That authenticator code is incorrect." };
  }

  const backupCodes = await generateBackupCodes(user.id);
  await audit("account.backup_codes.regenerated", { userId: user.id });
  revalidatePath("/account");
  return { backupCodes };
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
