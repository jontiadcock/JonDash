import "server-only";
import type { User } from "@/lib/generated/prisma";
import { prisma } from "@/lib/db";

export type VisibleLink = {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
  updatedAt: Date;
  source: "personal" | string; // "personal" or the role name it came from
};

/**
 * All service tiles a user can see: their personal tiles plus the tiles from
 * every role assigned to them. Personal tiles come first; role tiles follow,
 * grouped by role name. De-duplicated by URL (personal wins).
 */
export async function getUserVisibleLinks(userId: string): Promise<VisibleLink[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { serviceRoles: { select: { id: true } } },
  });
  if (!user) return [];

  const roleIds = user.serviceRoles.map((r) => r.id);

  const links = await prisma.link.findMany({
    where: {
      OR: [{ userId }, roleIds.length ? { roleId: { in: roleIds } } : { id: "__none__" }],
    },
    include: { role: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const personal = links
    .filter((l) => l.userId === userId)
    .map((l) => ({ ...toVisible(l, "personal") }));

  const role = links
    .filter((l) => l.roleId)
    .map((l) => toVisible(l, l.role?.name ?? "Role"))
    .sort((a, b) => a.source.localeCompare(b.source));

  // De-duplicate by URL, personal taking precedence.
  const seen = new Set<string>();
  const result: VisibleLink[] = [];
  for (const link of [...personal, ...role]) {
    const key = link.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}

function toVisible(
  l: { id: string; title: string; url: string; iconPath: string | null; updatedAt: Date },
  source: string,
): VisibleLink {
  return {
    id: l.id,
    title: l.title,
    url: l.url,
    iconPath: l.iconPath,
    updatedAt: l.updatedAt,
    source,
  };
}

/** Whether a user is allowed to view a given link (for icon serving). */
export async function canViewLink(
  user: Pick<User, "id" | "role">,
  link: { userId: string | null; roleId: string | null },
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (link.userId && link.userId === user.id) return true;
  if (link.roleId) {
    const count = await prisma.serviceRole.count({
      where: { id: link.roleId, users: { some: { id: user.id } } },
    });
    return count > 0;
  }
  return false;
}
