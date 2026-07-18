import "server-only";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import { encryptString, decryptString } from "@/lib/crypto";

// Allow a small time drift window (previous/next 30s step).
authenticator.options = { window: 1 };

const ISSUER = "JonDash";

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

export function encryptTotpSecret(secret: string): string {
  return encryptString(secret);
}
