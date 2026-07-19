import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function user(email: string, role: "ADMIN" | "USER") {
  return prisma.user.create({ data: { email, role, status: "ACTIVE" } });
}

describe("effective permissions (delegated admin)", () => {
  it("a full ADMIN implicitly has every capability", async () => {
    const admin = await user("admin@t.local", "ADMIN");
    const perms = await getEffectivePermissions(admin);
    expect(perms.has("users.manage")).toBe(true);
    expect(perms.has("settings.manage")).toBe(true);
    expect(perms.has("backups.manage")).toBe(true);
  });

  it("a plain USER with no access roles has nothing", async () => {
    const u = await user("nobody@t.local", "USER");
    const perms = await getEffectivePermissions(u);
    expect(perms.size).toBe(0);
  });

  it("grants exactly the capabilities of assigned access roles (and no more)", async () => {
    const role = await prisma.accessRole.create({
      data: { name: "Help desk", permissionsJson: JSON.stringify(["users.reset"]) },
    });
    const u = await user("helpdesk@t.local", "USER");
    await prisma.user.update({
      where: { id: u.id },
      data: { accessRoles: { connect: { id: role.id } } },
    });

    const perms = await getEffectivePermissions(u);
    expect(perms.has("users.reset")).toBe(true); // granted
    expect(perms.has("users.manage")).toBe(false); // NOT granted
    expect(perms.has("settings.manage")).toBe(false); // NOT granted
  });

  it("unions the capabilities of multiple access roles, ignoring junk keys", async () => {
    const a = await prisma.accessRole.create({
      data: { name: "A", permissionsJson: JSON.stringify(["users.manage", "bogus.cap"]) },
    });
    const b = await prisma.accessRole.create({
      data: { name: "B", permissionsJson: JSON.stringify(["audit.view"]) },
    });
    const u = await user("multi@t.local", "USER");
    await prisma.user.update({
      where: { id: u.id },
      data: { accessRoles: { connect: [{ id: a.id }, { id: b.id }] } },
    });

    const perms = await getEffectivePermissions(u);
    expect([...perms].sort()).toEqual(["audit.view", "users.manage"]);
  });
});
