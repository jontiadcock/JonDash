import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { visibleModuleIds, canViewModule, setModuleGroups } from "@/lib/modules/visibility";
import {
  setModuleSize,
  moveModule,
  getUserModuleLayout,
  applyLayoutOrder,
  resetModuleLayout,
  MAX_WIDTH,
} from "@/lib/modules/layout";

// Module RBAC decides who can see a module's widget and reach its /m/<id> page, so it is
// enforced server-side. These pin the rule that matters: NO groups = everyone (the
// behaviour before the feature existed), groups = members only, admins always.

async function mkUser(email: string, role: "ADMIN" | "USER") {
  return prisma.user.create({ data: { email, role, status: "ACTIVE" } });
}
async function mkModule(id: string) {
  return prisma.module.create({ data: { id, name: id, version: "1.0.0", enabled: true } });
}

let admin: { id: string };
let member: { id: string };
let outsider: { id: string };
let groupId: string;

async function cleanup() {
  await prisma.moduleLayout.deleteMany();
  await prisma.module.deleteMany();
  await prisma.serviceRole.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: "@rbac.test" } } });
}

beforeEach(async () => {
  await cleanup();
  admin = await mkUser("admin@rbac.test", "ADMIN");
  member = await mkUser("member@rbac.test", "USER");
  outsider = await mkUser("outsider@rbac.test", "USER");
  const group = await prisma.serviceRole.create({
    data: { name: "Household", users: { connect: [{ id: member.id }] } },
  });
  groupId = group.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("module visibility (Service Group RBAC)", () => {
  it("an unrestricted module is visible to everyone signed in", async () => {
    await mkModule("open");
    for (const u of [admin, member, outsider]) {
      expect(await canViewModule("open", { id: u.id, role: "USER" })).toBe(true);
    }
  });

  it("assigning groups restricts it to their members", async () => {
    await mkModule("private");
    await setModuleGroups("private", [groupId]);

    expect(await canViewModule("private", { id: member.id, role: "USER" })).toBe(true);
    expect(await canViewModule("private", { id: outsider.id, role: "USER" })).toBe(false);
    // Admins are never locked out of a module they administer.
    expect(await canViewModule("private", { id: admin.id, role: "ADMIN" })).toBe(true);
  });

  it("clearing the groups makes it visible to everyone again", async () => {
    await mkModule("private");
    await setModuleGroups("private", [groupId]);
    expect(await canViewModule("private", { id: outsider.id, role: "USER" })).toBe(false);

    await setModuleGroups("private", []);
    expect(await canViewModule("private", { id: outsider.id, role: "USER" })).toBe(true);
  });

  it("the dashboard list matches the per-module check", async () => {
    await mkModule("open");
    await mkModule("private");
    await setModuleGroups("private", [groupId]);

    expect([...(await visibleModuleIds({ id: member.id, role: "USER" }))].sort()).toEqual(["open", "private"]);
    expect([...(await visibleModuleIds({ id: outsider.id, role: "USER" }))]).toEqual(["open"]);
    expect([...(await visibleModuleIds({ id: admin.id, role: "ADMIN" }))].sort()).toEqual(["open", "private"]);
  });

  it("a disabled module is in nobody's list", async () => {
    await mkModule("open");
    await prisma.module.update({ where: { id: "open" }, data: { enabled: false } });
    expect([...(await visibleModuleIds({ id: admin.id, role: "ADMIN" }))]).toEqual([]);
  });
});

describe("per-user widget layout", () => {
  it("saves size per user, so one person's layout never changes another's", async () => {
    await setModuleSize(member.id, "open", 3, 2);

    const mine = await getUserModuleLayout(member.id);
    expect(mine.get("open")).toMatchObject({ width: 3, height: 2 });
    expect((await getUserModuleLayout(outsider.id)).size).toBe(0);
  });

  it("clamps sizes to the grid instead of trusting the input", async () => {
    await setModuleSize(member.id, "open", 99, -5);
    expect((await getUserModuleLayout(member.id)).get("open")).toMatchObject({ width: MAX_WIDTH, height: 1 });
  });

  it("reorders widgets and keeps the order stable", async () => {
    const order = ["a", "b", "c"];
    await moveModule(member.id, "c", "up", order);

    const layout = await getUserModuleLayout(member.id);
    const sorted = applyLayoutOrder(
      order.map((id) => ({ def: { id } })),
      layout,
    ).map((m) => m.def.id);
    expect(sorted).toEqual(["a", "c", "b"]);
  });

  it("won't move past the ends", async () => {
    const order = ["a", "b"];
    await moveModule(member.id, "a", "up", order); // already first
    expect((await getUserModuleLayout(member.id)).size).toBe(0); // nothing written
  });

  it("resetting returns a widget to the default", async () => {
    await setModuleSize(member.id, "open", 3, 3);
    await resetModuleLayout(member.id, "open");
    expect((await getUserModuleLayout(member.id)).get("open")).toBeUndefined();
  });

  it("modules without a saved position keep their natural order, after positioned ones", async () => {
    await moveModule(member.id, "b", "up", ["a", "b"]); // positions a and b
    const layout = await getUserModuleLayout(member.id);
    const sorted = applyLayoutOrder(
      [{ def: { id: "a" } }, { def: { id: "b" } }, { def: { id: "zz" } }],
      layout,
    ).map((m) => m.def.id);
    expect(sorted).toEqual(["b", "a", "zz"]);
  });
});
