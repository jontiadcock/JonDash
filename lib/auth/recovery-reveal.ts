import "server-only";
import { cookies } from "next/headers";
import { encryptString, decryptString } from "@/lib/crypto";
import { isSecureRequest } from "@/lib/request";

/**
 * Carries freshly generated backup codes to a dedicated one-time "reveal" page.
 *
 * Why a cookie: after account setup / admin bootstrap completes, the originating
 * page's server guard re-renders and redirects (the account is now active), so
 * codes can't be shown inline. We stash the raw codes in a short-lived, encrypted
 * httpOnly cookie and redirect to /recovery-codes, which shows them once. `next`
 * is where "continue" leads (dashboard when signed in, login otherwise).
 */
const REVEAL_COOKIE = "dashboard_reveal";
const REVEAL_TTL_MS = 1000 * 60 * 10; // 10 minutes

export async function setRevealCodes(codes: string[], next: string): Promise<void> {
  const payload = JSON.stringify({ codes, next, exp: Date.now() + REVEAL_TTL_MS });
  const jar = await cookies();
  jar.set(REVEAL_COOKIE, encryptString(payload), {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: "strict",
    path: "/",
    maxAge: REVEAL_TTL_MS / 1000,
  });
}

export async function peekRevealCodes(): Promise<{ codes: string[]; next: string } | null> {
  const jar = await cookies();
  const raw = jar.get(REVEAL_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { codes, next, exp } = JSON.parse(decryptString(raw)) as {
      codes: string[];
      next: string;
      exp: number;
    };
    if (typeof exp !== "number" || exp < Date.now()) return null;
    if (!Array.isArray(codes) || codes.length === 0) return null;
    return { codes, next: typeof next === "string" ? next : "/login" };
  } catch {
    return null;
  }
}

export async function clearRevealCodes(): Promise<void> {
  const jar = await cookies();
  jar.delete(REVEAL_COOKIE);
}
