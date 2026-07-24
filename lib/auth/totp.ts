import "server-only";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import { encryptString, decryptString } from "@/lib/crypto";
import { prisma } from "@/lib/db";

// Allow a small time drift window (previous/next 30s step).
authenticator.options = { window: 1 };

const ISSUER = "JonDash";

/** RFC 6238 time step in seconds — otplib's default, and what our codes assume. */
const TOTP_PERIOD_SECONDS = 30;

/** The timestep a given moment falls in: floor(epoch / period). */
export function totpStepAt(at: number = Date.now()): number {
  return Math.floor(at / 1000 / TOTP_PERIOD_SECONDS);
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** otpauth:// URI + PNG data URL for enrolment (QR shown to the user). */
export async function buildTotpEnrolment(email: string, secret: string) {
  const otpauth = authenticator.keyuri(email, ISSUER, secret);
  const qrDataUrl = await qrcode.toDataURL(otpauth, { margin: 1, width: 220 });
  return { otpauth, qrDataUrl };
}

/** Verify a 6-digit code against a plaintext secret. */
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
 * Verify a code for a user **and consume it**, so the same digits can't be used
 * twice.
 *
 * A TOTP code stays mathematically valid for its whole 30-second step plus the
 * drift window either side, so verification alone lets one code authenticate
 * repeatedly until it ages out — RFC 6238 §5.2 requires a validated OTP be
 * accepted once. We record the highest step accepted per user and refuse
 * anything at or below it.
 *
 * The guard lives in the UPDATE's WHERE clause rather than in a read-then-write,
 * so two requests racing with the same code cannot both succeed: the loser
 * matches no row and is rejected.
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

export function encryptTotpSecret(secret: string): string {
  return encryptString(secret);
}
