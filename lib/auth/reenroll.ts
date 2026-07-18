import "server-only";
import { cookies } from "next/headers";
import { encryptString, decryptString } from "@/lib/crypto";
import { isSecureRequest } from "@/lib/request";

/**
 * Holds the NEW TOTP secret while a user re-enrols an authenticator, in an
 * encrypted, short-lived cookie — so the pending secret is never persisted to
 * the DB (or tamperable in the page) until the change is confirmed.
 */
const REENROLL_COOKIE = "dashboard_reenroll";
const REENROLL_TTL_MS = 1000 * 60 * 10; // 10 minutes

export async function setPendingTotp(secret: string): Promise<void> {
  const payload = JSON.stringify({ secret, exp: Date.now() + REENROLL_TTL_MS });
  const jar = await cookies();
  jar.set(REENROLL_COOKIE, encryptString(payload), {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: "strict",
    path: "/",
    maxAge: REENROLL_TTL_MS / 1000,
  });
}

export async function getPendingTotp(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(REENROLL_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { secret, exp } = JSON.parse(decryptString(raw)) as { secret: string; exp: number };
    if (typeof exp !== "number" || exp < Date.now()) return null;
    return typeof secret === "string" ? secret : null;
  } catch {
    return null;
  }
}

export async function clearPendingTotp(): Promise<void> {
  const jar = await cookies();
  jar.delete(REENROLL_COOKIE);
}
