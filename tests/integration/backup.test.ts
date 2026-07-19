import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { serializeBackup, parseBackup, applyRestore } from "@/lib/backup";
import { resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function seed() {
  const role = await prisma.serviceRole.create({
    data: { name: "Team", links: { create: [{ title: "Shared", url: "https://shared.com", sortOrder: 0 }] } },
  });
  const user = await prisma.user.create({
    data: {
      email: "owner@t.local",
      role: "ADMIN",
      status: "ACTIVE",
      passwordHash: "argon2-hash",
      totpSecretEnc: "ENC_SECRET",
      mfaEnabled: true,
      serviceRoles: { connect: { id: role.id } },
      links: { create: [{ title: "Personal", url: "https://personal.com", sortOrder: 0 }] },
      backupCodes: { create: [{ codeHash: "hash1" }, { codeHash: "hash2" }] },
    },
  });
  return { role, user };
}

describe("backup export/import", () => {
  it("plain export contains data and is not encrypted", async () => {
    await seed();
    const json = await serializeBackup(["roles"], null);
    const env = JSON.parse(json);
    expect(env.encrypted).toBe(false);
    expect(env.data.roles).toHaveLength(1);
    expect(env.data.roles[0].name).toBe("Team");
  });

  it("encrypted export hides the payload and needs the passphrase", async () => {
    await seed();
    const json = await serializeBackup(["users", "roles"], "pw-123");
    const env = JSON.parse(json);
    expect(env.encrypted).toBe(true);
    expect(env.data).toBeUndefined(); // ciphertext only
    expect(JSON.stringify(env)).not.toContain("argon2-hash");

    // Correct passphrase decrypts, incl. credentials.
    const { data } = parseBackup(json, "pw-123");
    expect(data.users?.[0].credentials?.passwordHash).toBe("argon2-hash");

    // Wrong passphrase / missing passphrase are rejected.
    expect(() => parseBackup(json, "wrong")).toThrow(/passphrase|corrupt/i);
    expect(() => parseBackup(json, null)).toThrow(/encrypted/i);
  });

  it("restores a full snapshot (users, roles, links, membership, credentials)", async () => {
    const { user, role } = await seed();
    const json = await serializeBackup(["users", "roles"], "pw-123");
    const { data, includes } = parseBackup(json, "pw-123");

    await resetDb(); // simulate data loss
    expect(await prisma.user.count()).toBe(0);

    await applyRestore(data, includes);

    const restored = await prisma.user.findUnique({
      where: { id: user.id },
      include: { links: true, serviceRoles: true, backupCodes: true },
    });
    expect(restored?.email).toBe("owner@t.local");
    expect(restored?.role).toBe("ADMIN");
    expect(restored?.passwordHash).toBe("argon2-hash");
    expect(restored?.totpSecretEnc).toBe("ENC_SECRET");
    expect(restored?.mfaEnabled).toBe(true);
    expect(restored?.links.map((l) => l.url)).toEqual(["https://personal.com"]);
    expect(restored?.serviceRoles.map((r) => r.id)).toEqual([role.id]);
    expect(restored?.backupCodes).toHaveLength(2);

    const restoredRole = await prisma.serviceRole.findUnique({ where: { id: role.id }, include: { links: true } });
    expect(restoredRole?.name).toBe("Team");
    expect(restoredRole?.links.map((l) => l.url)).toEqual(["https://shared.com"]);
  });
});
