import "server-only";
import { prisma } from "@/lib/db";
import { resolveLocation } from "@/lib/geo";

/** REFS app/components/sessions-list.tsx › SessionRow — the presentational shape this feeds */
export type SessionView = {
  id: string;
  ip: string | null;
  location: string | null;
  device: string;
  lastSeenAt: Date;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
};

/** A very small user-agent summariser — enough for a recognisable device label, and deliberately
 *  not fingerprinting. No caller outside this file. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Resolve and PERSIST a coarse location for sessions that lack one, so the external lookup happens
 * once per session rather than per page view. ⚠ Best-effort — a failure leaves it null and the UI
 * falls back to the raw IP. REFS lib/geo.ts › resolveLocation()
 */
async function enrichLocations(
  sessions: { id: string; ip: string | null; location: string | null }[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  await Promise.all(
    sessions.map(async (s) => {
      if (s.location) {
        out.set(s.id, s.location);
        return;
      }
      const loc = await resolveLocation(s.ip);
      out.set(s.id, loc);
      if (loc) {
        await prisma.session
          .update({ where: { id: s.id }, data: { location: loc } })
          .catch(() => {});
      }
    }),
  );
  return out;
}

function toView(
  s: {
    id: string;
    ip: string | null;
    userAgent: string | null;
    lastSeenAt: Date;
    createdAt: Date;
    expiresAt: Date;
  },
  location: string | null,
  currentId: string | null,
): SessionView {
  return {
    id: s.id,
    ip: s.ip,
    location,
    device: describeDevice(s.userAgent),
    lastSeenAt: s.lastSeenAt,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    current: s.id === currentId,
  };
}

/** Active sessions for ONE user, newest activity first. ⚠ Scoped by `userId` here, which is what
 *  keeps the account page from listing anyone else's. REFS app/(app)/account/page.tsx */
export async function listUserSessions(
  userId: string,
  currentId: string | null,
): Promise<SessionView[]> {
  const sessions = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
  const locs = await enrichLocations(sessions);
  return sessions.map((s) => toView(s, locs.get(s.id) ?? null, currentId));
}

/** REFS app/components/sessions-list.tsx › SessionRow — `showUser` renders the extra column */
export type AdminSessionView = SessionView & { userId: string; userEmail: string };

/** Every active session, across all users. ⚠ Admin-only — the page is what enforces that, not
 *  this. REFS app/admin/sessions/page.tsx · lib/auth/permissions.ts › the sessions capability */
export async function listAllSessions(currentId: string | null): Promise<AdminSessionView[]> {
  const sessions = await prisma.session.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    include: { user: { select: { email: true } } },
  });
  const locs = await enrichLocations(sessions);
  return sessions.map((s) => ({
    ...toView(s, locs.get(s.id) ?? null, currentId),
    userId: s.userId,
    userEmail: s.user.email,
  }));
}
