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

export type WelcomeState = { error?: string };

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
  redirect("/dashboard");
}

/** Discard the in-progress admin so setup can be restarted with a new email. */
export async function welcomeRestartAction(): Promise<void> {
  await assertSameOrigin();
  if (await hasActiveAdmin()) redirect("/login");
  const admin = await getPendingAdmin();
  if (admin) await prisma.user.delete({ where: { id: admin.id } });
  redirect("/welcome");
}
