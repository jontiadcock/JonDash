import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "@/lib/modules/types";
import { enableModule, disableModule } from "@/lib/modules/manage";
import { parseGrants } from "@/lib/modules/permissions";

/**
 * BUG-56 — a permission revoked on Admin → Addon Permissions must stay revoked.
 *
 * The defect was silent in the worst way: the Permissions page kept showing the capability as
 * off while the module held it again, because `enableModule` rewrote the full declared set on
 * every enable. A plain disable → enable round trip was enough. So the test that matters is the
 * round trip, not the revocation.
 *
 * Owner decision (2026-07-27): an update NEVER re-grants something you revoked. Adding is the
 * consent screen's job, and only for permissions that are genuinely new in that version.
 * REFS lib/modules/types.ts · lib/modules/manage.ts · lib/modules/permissions.ts
 */

const ID = "revoketest";

function def(permissions: ModuleDefinition["permissions"]): ModuleDefinition {
  return {
    id: ID,
    name: "Revoke test",
    description: "test",
    version: "1.0.0",
    minAppVersion: "1.4.0",
    permissions,
  };
}

async function grantsOf(): Promise<string[]> {
  const row = await prisma.module.findUnique({ where: { id: ID }, select: { grantedPermissions: true } });
  return row ? parseGrants(row.grantedPermissions) : [];
}

/** What the admin does on Admin → Addon Permissions when they turn a switch off. */
async function revoke(permission: string) {
  const current = await grantsOf();
  await prisma.module.update({
    where: { id: ID },
    data: { grantedPermissions: JSON.stringify(current.filter((p) => p !== permission)) },
  });
}

beforeEach(async () => {
  await prisma.module.deleteMany({ where: { id: ID } });
});

afterAll(async () => {
  await prisma.module.deleteMany({ where: { id: ID } });
  await prisma.$disconnect();
});

describe("a revoked module permission survives an enable round trip", () => {
  it("grants the full declared set on FIRST enable", async () => {
    await enableModule(def(["network:outbound", "audit:write"]));
    expect((await grantsOf()).sort()).toEqual(["audit:write", "network:outbound"]);
  });

  it("does not restore a revoked permission on disable → enable", async () => {
    const d = def(["network:outbound", "audit:write"]);
    await enableModule(d);
    await revoke("network:outbound");
    expect(await grantsOf()).toEqual(["audit:write"]);

    await disableModule(d);
    await enableModule(d); // the exact round trip that used to undo it

    expect(await grantsOf(), "the revoked permission came back").toEqual(["audit:write"]);
  });

  it("does not restore a revoked permission when the version changes", async () => {
    await enableModule(def(["network:outbound", "audit:write"]));
    await revoke("network:outbound");

    // A newer version that still declares both. Re-declaring is not re-consenting.
    const newer = { ...def(["network:outbound", "audit:write"]), version: "1.1.0" };
    await enableModule(newer);

    expect(await grantsOf()).toEqual(["audit:write"]);
    const row = await prisma.module.findUnique({ where: { id: ID }, select: { version: true } });
    expect(row?.version, "the version should still update").toBe("1.1.0");
  });

  it("drops a permission the module no longer declares", async () => {
    await enableModule(def(["network:outbound", "audit:write"]));
    await enableModule(def(["audit:write"])); // network:outbound withdrawn by the module
    expect(await grantsOf()).toEqual(["audit:write"]);
  });

  it("never adds a permission that is new in this version", async () => {
    // Adding belongs to the consent gate on the update path, not to enable. A module that
    // starts declaring something new must not acquire it just by being re-enabled.
    await enableModule(def(["audit:write"]));
    await enableModule(def(["audit:write", "crypto:use"]));
    expect(await grantsOf(), "a newly declared permission was granted without consent").toEqual([
      "audit:write",
    ]);
  });

  it("keeps an enable idempotent when nothing was revoked", async () => {
    const d = def(["network:outbound", "audit:write"]);
    await enableModule(d);
    await enableModule(d);
    expect((await grantsOf()).sort()).toEqual(["audit:write", "network:outbound"]);
  });
});
