import "server-only";
import { cookies } from "next/headers";
import { encryptString, decryptString } from "@/lib/crypto";
import { isSecureRequest } from "@/lib/request";

/**
 * Short-lived "password verified, awaiting TOTP" state, carried in an encrypted
 * cookie between login step 1 and step 2. Contains only the user id + expiry.
 */
const PREAUTH_COOKIE = "dashboard_preauth";
const PREAUTH_TTL_MS = 1000 * 60 * 5; // 5 minutes

export async function setPreAuth(userId: string): Promise<void> {
  const payload = JSON.stringify({ userId, exp: Date.now() + PREAUTH_TTL_MS });
  const jar = await cookies();
  jar.set(PREAUTH_COOKIE, encryptString(payload), {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: "strict",
    path: "/",
    maxAge: PREAUTH_TTL_MS / 1000,
  });
}

export async function getPreAuthUserId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(PREAUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { userId, exp } = JSON.parse(decryptString(raw)) as { userId: string; exp: number };
    if (typeof exp !== "number" || exp < Date.now()) return null;
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}

export async function clearPreAuth(): Promise<void> {
  const jar = await cookies();
  jar.delete(PREAUTH_COOKIE);
}
