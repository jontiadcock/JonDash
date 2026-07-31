import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * `source` is "personal" or the Service Group name a tile came from.
 * REFS app/components/service-tile.tsx — what renders one
 */
export type VisibleLink = {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
  updatedAt: Date;
  source: "personal" | string; // "personal" or the role name it came from
};

/**
 * Every service tile a user can see: their own, plus the tiles of each Service Group assigned to
 * them. Personal first, then group tiles by group name, de-duplicated by URL with personal winning.
 *
 * ⚠ This is the visibility boundary for tiles. `app/(app)/dashboard/layout-actions.ts` filters
 * layout writes against it, so a tile missing here cannot be positioned or discovered either.
 * REFS canViewLink() below — the single-tile form · app/(app)/dashboard/page.tsx
 * PINS tests/integration/rbac.test.ts
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

/** Whether a user may view one link. ⚠ The icon route's ONLY guard — without it an icon URL
 *  discloses that a tile exists to anyone signed in.
 *  REFS app/api/icons/[id]/route.ts  PINS tests/integration/rbac.test.ts */
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
