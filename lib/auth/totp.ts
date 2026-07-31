import "server-only";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import { encryptString, decryptString } from "@/lib/crypto";
import { prisma } from "@/lib/db";

// Allow a small time drift window (previous/next 30s step).
authenticator.options = { window: 1 };

const DEFAULT_ISSUER = "JonDash";

/**
 * The label authenticator apps show for this instance. Follows the rebranding app name
 * (CORE-06) so a renamed install enrols under its own name.
 *
 * **Only affects NEW enrolments.** The issuer is baked into the `otpauth://` URI at scan
 * time, so entries already in someone's authenticator keep the old label — and keep working,
 * because the shared secret is unchanged. Renaming never invalidates an existing enrolment.
 */
async function issuer(): Promise<string> {
  try {
    const { getAppName } = await import("@/lib/settings");
    return (await getAppName()) || DEFAULT_ISSUER;
  } catch {
    return DEFAULT_ISSUER;
  }
}

/** RFC 6238 time step in seconds — otplib's default, and what our codes assume. */
const TOTP_PERIOD_SECONDS = 30;

/** The timestep a given moment falls in: floor(epoch / period). */
/** PINS tests/unit/totp.test.ts */
export function totpStepAt(at: number = Date.now()): number {
  return Math.floor(at / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * REFS app/(app)/account/authenticator/actions.ts · app/setup/[token]/page.tsx
 *      app/welcome/actions.ts
 * PINS tests/integration/backup.test.ts · tests/unit/totp.test.ts
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** otpauth:// URI + PNG data URL for enrolment (QR shown to the user). */
/**
 * REFS app/(app)/account/authenticator/actions.ts · app/setup/[token]/page.tsx
 *      app/welcome/page.tsx
 */
export async function buildTotpEnrolment(email: string, secret: string) {
  const otpauth = authenticator.keyuri(email, await issuer(), secret);
  const qrDataUrl = await qrcode.toDataURL(otpauth, { margin: 1, width: 220 });
  return { otpauth, qrDataUrl };
}

/** Verify a 6-digit code against a plaintext secret. */
/**
 * REFS app/(app)/account/authenticator/actions.ts
 * PINS tests/unit/totp.test.ts
 */
export function verifyTotp(code: string, secret: string): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  try {
    return authenticator.verify({ token: normalized, secret });
  } catch {
    return false;
  }
}

/** Verify a code against the encrypted secret stored on the user record. */
/** PINS tests/integration/backup.test.ts · tests/unit/totp.test.ts */
export function verifyTotpEncrypted(code: string, encryptedSecret: string): boolean {
  try {
    return verifyTotp(code, decryptString(encryptedSecret));
  } catch {
    return false;
  }
}

/**
 * Verify a code and report *which* timestep it matched, rather than only whether
 * it did.
 *
 * The drift window means a valid code may sit one step behind or ahead of now, so
 * a boolean isn't enough to record what was consumed — we need the step itself.
 * Returns null when the code doesn't verify.
 * PINS tests/unit/totp.test.ts
 */
export function verifyTotpStep(code: string, secret: string): number | null {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  try {
    const delta = authenticator.checkDelta(normalized, secret);
    return typeof delta === "number" ? totpStepAt() + delta : null;
  } catch {
    return null;
  }
}

/**
 * Verify a code for a user AND consume it. ⚠ Verification alone is not enough: a code stays valid
 * for its whole step plus the drift window, so one would authenticate repeatedly (RFC 6238 §5.2
 * requires a validated OTP be accepted once). The highest step accepted is recorded per user.
 * ⚠ The guard lives in the UPDATE's WHERE clause, never a read-then-write — two requests racing
 * with the same code would otherwise both succeed.
 * REFS app/(app)/account/actions.ts · app/(app)/account/authenticator/actions.ts
 *      app/login/actions.ts · app/setup/[token]/actions.ts · app/welcome/actions.ts
 *      lib/auth/stepup.ts
 * PINS tests/unit/totp.test.ts
 */
export async function consumeTotpForUser(
  user: { id: string; totpSecretEnc: string | null; totpLastStep: number | null },
  code: string,
): Promise<boolean> {
  if (!user.totpSecretEnc) return false;

  let step: number | null;
  try {
    step = verifyTotpStep(code, decryptString(user.totpSecretEnc));
  } catch {
    return false;
  }
  if (step === null) return false;
  if (user.totpLastStep !== null && step <= user.totpLastStep) return false;

  const claimed = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
    },
    data: { totpLastStep: step },
  });
  return claimed.count === 1;
}

/**
 * REFS app/(app)/account/authenticator/actions.ts · app/setup/[token]/page.tsx
 *      app/welcome/actions.ts
 * PINS tests/integration/backup.test.ts · tests/unit/totp.test.ts
 */
export function encryptTotpSecret(secret: string): string {
  return encryptString(secret);
}
