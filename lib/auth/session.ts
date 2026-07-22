import "server-only";
import { cookies, headers } from "next/headers";
import type { Session, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";
import { isSecureRequest } from "@/lib/request";
import { getSessionLifetimeMs, getIdleTimeoutMs } from "@/lib/settings";
import { SERVER_BOOT_TIME } from "@/lib/boot";

// Only rewrite lastSeenAt when it's older than this, to avoid a write per request.
const LAST_SEEN_THROTTLE_MS = 1000 * 60 * 5; // 5 minutes

// SERVER_BOOT_TIME (lib/boot) is when this process started. Any session created
// before it is from an earlier run, so restarting the server invalidates every
// existing session and users must sign in again.
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
  const expiresAt = new Date(Date.now() + (await getSessionLifetimeMs()));
  const { ip, userAgent } = await requestMeta();

  // A fresh session is created right after the second factor (TOTP or backup
  // code) succeeds, so mark TOTP as verified now for step-up purposes.
  await prisma.session.create({
    data: { userId, tokenHash, expiresAt, ip, userAgent, totpVerifiedAt: new Date() },
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

  // A server restart signs everyone out: reject sessions created before this run.
  if (session.createdAt.getTime() < SERVER_BOOT_TIME) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;

  // Idle timeout: sign out sessions inactive longer than the configured window.
  const idleMs = await getIdleTimeoutMs();
  const sinceSeen = Date.now() - session.lastSeenAt.getTime();
  if (idleMs > 0 && sinceSeen > idleMs) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Throttled "last seen" bump. When an idle timeout is set, refresh more eagerly
  // than half the window so an active user is never mistaken for idle.
  const bumpThreshold =
    idleMs > 0 ? Math.min(LAST_SEEN_THROTTLE_MS, Math.floor(idleMs / 2)) : LAST_SEEN_THROTTLE_MS;
  if (sinceSeen > bumpThreshold) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  return session.user;
}

/** The current session row (for step-up checks and "this device" tagging), or null. */
export async function getCurrentSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
}

/** Mark TOTP as freshly verified on the current session (step-up success). */
export async function markCurrentSessionTotpVerified(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await prisma.session
    .updateMany({ where: { tokenHash: hashToken(token) }, data: { totpVerifiedAt: new Date() } })
    .catch(() => {});
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
