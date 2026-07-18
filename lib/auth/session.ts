import "server-only";
import { cookies, headers } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";
import { isSecureRequest } from "@/lib/request";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
// Fixed name (works over http and https). The Secure flag is set automatically
// when the request is HTTPS, so no configuration is needed.
export const SESSION_COOKIE = "dashboard_session";

async function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: "strict" as const,
    path: "/",
  };
}

async function requestMeta() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
  const userAgent = h.get("user-agent") ?? undefined;
  return { ip, userAgent };
}

/** Create a new session for a user and set the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { ip, userAgent } = await requestMeta();

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt, ip, userAgent },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...(await baseCookieOptions()), expires: expiresAt });
}

/** Resolve the current user from the session cookie, or null. Prunes if expired. */
export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  return session.user;
}

/** Destroy the current session (logout). */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session for a user (used by admin "reset access"). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
