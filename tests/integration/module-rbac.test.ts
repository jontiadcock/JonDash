import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { visibleModuleIds, canViewModule, setModuleGroups } from "@/lib/modules/visibility";
import {
  setItemSize,
  reorderItems,
  getUserLayout,
  applyLayoutOrder,
  resetItem,
  itemKey,
  GEOMETRY,
} from "@/lib/dashboard/layout";

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
  await prisma.dashboardLayout.deleteMany();
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

describe("per-user dashboard layout", () => {
  const mod = (id: string) => ({ kind: "module" as const, id });
  const link = (id: string) => ({ kind: "link" as const, id });

  it("saves size per user, so one person's layout never changes another's", async () => {
    await setItemSize(member.id, "module", "open", "wide", 3, 2);

    const mine = await getUserLayout(member.id, "wide");
    expect(mine.get(itemKey("module", "open"))).toMatchObject({ width: 3, height: 2 });
    expect((await getUserLayout(outsider.id, "wide")).size).toBe(0);
  });

  it("clamps sizes to the grid instead of trusting the input", async () => {
    await setItemSize(member.id, "module", "open", "wide", 99, -5);
    expect((await getUserLayout(member.id, "wide")).get(itemKey("module", "open"))).toMatchObject({
      width: GEOMETRY.wide.columns,
      height: 1,
    });
  });

  it("resetting returns an item to the default", async () => {
    await setItemSize(member.id, "module", "open", "wide", 3, 3);
    await resetItem(member.id, "module", "open", "wide");
    expect((await getUserLayout(member.id, "wide")).get(itemKey("module", "open"))).toBeUndefined();
  });

  it("persists an arbitrary order, writing a row for items that had none", async () => {
    await reorderItems(member.id, "wide", [mod("a"), mod("c"), mod("b")]);
    const layout = await getUserLayout(member.id, "wide");
    const sorted = applyLayoutOrder([mod("a"), mod("b"), mod("c")], layout).map((i) => i.id);
    expect(sorted).toEqual(["a", "c", "b"]);
  });

  it("items without a saved position keep their natural order, after positioned ones", async () => {
    await reorderItems(member.id, "wide", [mod("b"), mod("a")]);
    const layout = await getUserLayout(member.id, "wide");
    const sorted = applyLayoutOrder([mod("a"), mod("b"), mod("zz")], layout).map((i) => i.id);
    expect(sorted).toEqual(["b", "a", "zz"]);
  });

  /** CORE-11: one ordering has to span both kinds, or the merge means nothing. */
  it("orders service tiles and module widgets in ONE sequence", async () => {
    await reorderItems(member.id, "wide", [link("tile-2"), mod("open"), link("tile-1")]);
    const layout = await getUserLayout(member.id, "wide");
    const sorted = applyLayoutOrder([mod("open"), link("tile-1"), link("tile-2")], layout).map(
      (i) => `${i.kind}:${i.id}`,
    );
    expect(sorted).toEqual(["link:tile-2", "module:open", "link:tile-1"]);
  });

  it("keeps a tile and a module of the same id apart", async () => {
    await setItemSize(member.id, "module", "same", "wide", 3, 3);
    await setItemSize(member.id, "link", "same", "wide", 1, 1);
    const layout = await getUserLayout(member.id, "wide");
    expect(layout.get(itemKey("module", "same"))).toMatchObject({ width: 3 });
    expect(layout.get(itemKey("link", "same"))).toMatchObject({ width: 1 });
  });

  /** CORE-12: the whole point is that a phone and a desktop don't overwrite each other. */
  it("keeps the two device profiles independent", async () => {
    await setItemSize(member.id, "module", "open", "wide", 4, 2);
    await setItemSize(member.id, "module", "open", "narrow", 1, 1);

    expect((await getUserLayout(member.id, "wide")).get(itemKey("module", "open"))).toMatchObject({
      width: 4,
      height: 2,
    });
    expect((await getUserLayout(member.id, "narrow")).get(itemKey("module", "open"))).toMatchObject({
      width: 1,
      height: 1,
    });
  });

  it("reordering one profile leaves the other alone", async () => {
    await reorderItems(member.id, "wide", [mod("a"), mod("b")]);
    await reorderItems(member.id, "narrow", [mod("b"), mod("a")]);

    const wide = applyLayoutOrder([mod("a"), mod("b")], await getUserLayout(member.id, "wide"));
    const narrow = applyLayoutOrder([mod("a"), mod("b")], await getUserLayout(member.id, "narrow"));
    expect(wide.map((i) => i.id)).toEqual(["a", "b"]);
    expect(narrow.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("resetting one profile leaves the other alone", async () => {
    await setItemSize(member.id, "module", "open", "wide", 3, 3);
    await setItemSize(member.id, "module", "open", "narrow", 2, 2);
    await resetItem(member.id, "module", "open", "narrow");

    expect((await getUserLayout(member.id, "wide")).get(itemKey("module", "open"))).toMatchObject({ width: 3 });
    expect((await getUserLayout(member.id, "narrow")).get(itemKey("module", "open"))).toBeUndefined();
  });
});
