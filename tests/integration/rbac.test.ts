import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getUserVisibleLinks, canViewLink } from "@/lib/services";
import { resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function seed() {
  const admin = await prisma.user.create({ data: { email: "admin@t.local", role: "ADMIN", status: "ACTIVE" } });
  const role = await prisma.serviceRole.create({ data: { name: "Team" } });
  const user1 = await prisma.user.create({
    data: { email: "u1@t.local", role: "USER", status: "ACTIVE", serviceRoles: { connect: { id: role.id } } },
  });
  const user2 = await prisma.user.create({ data: { email: "u2@t.local", role: "USER", status: "ACTIVE" } });

  const personalA = await prisma.link.create({ data: { userId: user1.id, title: "A", url: "https://a.com", sortOrder: 0 } });
  const roleB = await prisma.link.create({ data: { roleId: role.id, title: "B", url: "https://b.com", sortOrder: 0 } });
  // Same URL as the personal tile — should be de-duplicated (personal wins).
  await prisma.link.create({ data: { roleId: role.id, title: "A-dup", url: "https://a.com", sortOrder: 1 } });
  const personalD = await prisma.link.create({ data: { userId: user2.id, title: "D", url: "https://d.com", sortOrder: 0 } });

  return { admin, role, user1, user2, personalA, roleB, personalD };
}

describe("getUserVisibleLinks (RBAC + de-dup)", () => {
  it("returns personal + role tiles, personal first, de-duplicated by URL", async () => {
    const { user1 } = await seed();
    const links = await getUserVisibleLinks(user1.id);
    expect(links.map((l) => l.title)).toEqual(["A", "B"]); // A-dup dropped, A before B
    expect(links[0].source).toBe("personal");
    expect(links[1].source).toBe("Team");
  });

  it("a user without the role only sees their own tiles", async () => {
    const { user2 } = await seed();
    const links = await getUserVisibleLinks(user2.id);
    expect(links.map((l) => l.title)).toEqual(["D"]);
  });
});

describe("canViewLink (IDOR / icon authorization)", () => {
  it("owner can view their personal tile; others cannot", async () => {
    const { user1, user2, personalA } = await seed();
    expect(await canViewLink(user1, personalA)).toBe(true);
    expect(await canViewLink(user2, personalA)).toBe(false); // IDOR blocked
  });

  it("role tile is viewable by members only", async () => {
    const { user1, user2, roleB } = await seed();
    expect(await canViewLink(user1, roleB)).toBe(true); // member
    expect(await canViewLink(user2, roleB)).toBe(false); // non-member
  });

  it("admins can view any tile", async () => {
    const { admin, personalA, personalD, roleB } = await seed();
    expect(await canViewLink(admin, personalA)).toBe(true);
    expect(await canViewLink(admin, personalD)).toBe(true);
    expect(await canViewLink(admin, roleB)).toBe(true);
  });
});
