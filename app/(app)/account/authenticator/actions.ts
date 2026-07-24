"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import {
  generateTotpSecret,
  buildTotpEnrolment,
  verifyTotp,
  consumeTotpForUser,
  encryptTotpSecret,
} from "@/lib/auth/totp";
import { consumeBackupCode } from "@/lib/auth/backup-codes";
import { setPendingTotp, getPendingTotp, clearPendingTotp } from "@/lib/auth/reenroll";
import { assertSameOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit";

export type AuthorizeState = { error?: string; qrDataUrl?: string; secret?: string };
export type ReenrollState = { error?: string };

/**
 * Step 1 — authorise the change with a code from the CURRENT authenticator or a
 * one-time backup code (no password; email later). Only on success do we generate
 * the new secret, stash it in a short-lived cookie, and return the QR to scan.
 * Splitting authorisation from the new-code entry means the user only ever holds
 * one live TOTP code at a time.
 */
export async function authorizeReenrollAction(
  _prev: AuthorizeState,
  formData: FormData,
): Promise<AuthorizeState> {
  await assertSameOrigin();
  const user = await requireUser();

  if (!rateLimit(`reenroll-auth:${user.id}`, 6, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const authCode = String(formData.get("authCode") ?? "").trim();
  if (!authCode) {
    return { error: "Enter a code from your current authenticator, or a backup code." };
  }

  // Authorise: current authenticator code, else consume a one-time backup code.
  let authorised = false;
  if (user.totpSecretEnc && /^\d{6}$/.test(authCode)) {
    authorised = await consumeTotpForUser(user, authCode);
  }
  if (!authorised) {
    authorised = await consumeBackupCode(user.id, authCode);
  }
  if (!authorised) {
    await audit("account.totp.reenroll.fail", { userId: user.id });
    return { error: "That code is incorrect. Enter a current authenticator code, or a backup code." };
  }

  // Authorised — reveal a fresh secret to enrol. Its cookie also serves as the
  // proof-of-authorisation for step 2.
  const secret = generateTotpSecret();
  await setPendingTotp(secret);
  const { qrDataUrl } = await buildTotpEnrolment(user.email, secret);
  return { qrDataUrl, secret };
}

/**
 * Step 2 — confirm the new authenticator. The pending-secret cookie (only set
 * after step 1 succeeded) is the authorisation proof; the new 6-digit code must
 * match that pending secret. On success the account's TOTP secret is replaced.
 */
export async function confirmReenrollAction(
  _prev: ReenrollState,
  formData: FormData,
): Promise<ReenrollState> {
  await assertSameOrigin();
  const user = await requireUser();

  if (!rateLimit(`reenroll:${user.id}`, 6, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const pendingSecret = await getPendingTotp();
  if (!pendingSecret) {
    return { error: "This re-enrolment session expired. Start again." };
  }

  const newCode = String(formData.get("newCode") ?? "").replace(/\s/g, "");
  if (!verifyTotp(newCode, pendingSecret)) {
    return { error: "The code from your new authenticator is incorrect." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: encryptTotpSecret(pendingSecret), mfaEnabled: true },
  });
  await clearPendingTotp();
  await audit("account.totp.reenrolled", { userId: user.id });

  redirect("/account?reenrolled=1");
}
