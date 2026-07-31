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

/** REFS ./ui.tsx — the `useActionState` shape the authorise form reads */
export type AuthorizeState = { error?: string; qrDataUrl?: string; secret?: string };
/** REFS ./ui.tsx — the `useActionState` shape the confirm form reads */
export type ReenrollState = { error?: string };

/**
 * Step 1 — authorise the change with a code from the CURRENT authenticator or a one-time backup
 * code. ⚠ Only generate the new secret on success: splitting authorisation from the new-code entry
 * is what keeps the user holding exactly one live TOTP secret at a time.
 *
 * REFS lib/auth/reenroll.ts › setPendingTotp() — the short-lived cookie the QR is stashed in
 *      ./ui.tsx — the only caller · confirmReenrollAction() below — step 2, which consumes it
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
 * Step 2 — confirm the new authenticator. ⚠ The pending-secret cookie IS the authorisation proof;
 * it is only set once step 1 succeeded, and the new code must match that pending secret.
 *
 * REFS lib/auth/reenroll.ts › getPendingTotp() · clearPendingTotp()
 *      authorizeReenrollAction() above — step 1, which sets that cookie · ./ui.tsx — the caller
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
