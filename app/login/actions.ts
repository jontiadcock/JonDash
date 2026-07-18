"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { verifyTotpEncrypted } from "@/lib/auth/totp";
import { consumeBackupCode, backupCodeStatus } from "@/lib/auth/backup-codes";
import { createSession } from "@/lib/auth/session";
import { setPreAuth, getPreAuthUserId, clearPreAuth } from "@/lib/auth/preauth";
import { assertSameOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit";
import { emailSchema, totpCodeSchema } from "@/lib/validation/schemas";
import { headers } from "next/headers";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export type LoginState = { error?: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

export async function loginPasswordAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  await assertSameOrigin();

  const ip = await clientIp();
  if (!rateLimit(`login-pw:${ip}`, 10, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const emailParsed = emailSchema.safeParse(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const generic: LoginState = { error: "Invalid email or password." };
  if (!emailParsed.success || !password) return generic;

  const user = await prisma.user.findUnique({ where: { email: emailParsed.data } });
  if (!user || !user.passwordHash || user.status !== "ACTIVE") return generic;

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { error: "Account temporarily locked due to failed attempts. Try again later." };
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null,
      },
    });
    await audit("login.password.fail", { userId: user.id });
    return generic;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  // Password OK. If MFA somehow not enrolled, fail closed to setup.
  if (!user.mfaEnabled || !user.totpSecretEnc) {
    return { error: "Account setup incomplete. Contact your administrator." };
  }

  await setPreAuth(user.id);
  await audit("login.password.ok", { userId: user.id });
  redirect("/login"); // re-renders the page into the TOTP step
}

export async function loginTotpAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  await assertSameOrigin();

  const userId = await getPreAuthUserId();
  if (!userId) redirect("/login");

  if (!rateLimit(`login-totp:${userId}`, 6, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const codeParsed = totpCodeSchema.safeParse(formData.get("code"));
  if (!codeParsed.success) return { error: "Enter the 6-digit code from your authenticator app." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE" || !user.totpSecretEnc) {
    await clearPreAuth();
    redirect("/login");
  }

  if (!verifyTotpEncrypted(codeParsed.data, user.totpSecretEnc)) {
    await audit("login.totp.fail", { userId: user.id });
    return { error: "Incorrect code. Please try again." };
  }

  await clearPreAuth();
  await createSession(user.id);
  await audit("login.success", { userId: user.id });
  redirect("/dashboard");
}

/**
 * Second-factor fallback: sign in with a one-time backup/recovery code instead
 * of the authenticator. Same pre-auth + rate-limit guards as the TOTP step.
 */
export async function loginBackupCodeAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  await assertSameOrigin();

  const userId = await getPreAuthUserId();
  if (!userId) redirect("/login");

  if (!rateLimit(`login-backup:${userId}`, 6, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const raw = String(formData.get("code") ?? "").trim();
  if (!raw) return { error: "Enter one of your recovery codes." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") {
    await clearPreAuth();
    redirect("/login");
  }

  const consumed = await consumeBackupCode(user.id, raw);
  if (!consumed) {
    await audit("login.backup_code.fail", { userId: user.id });
    return { error: "That recovery code is invalid or already used." };
  }

  await clearPreAuth();
  await createSession(user.id);
  const { remaining } = await backupCodeStatus(user.id);
  await audit("login.backup_code.ok", {
    userId: user.id,
    detail: `${remaining} codes remaining`,
  });
  redirect("/dashboard");
}
