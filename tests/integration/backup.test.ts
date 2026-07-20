import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { prisma } from "@/lib/db";
import { serializeBackup, parseBackup, applyRestore } from "@/lib/backup";
import { writeNamedIcon, readIcon, deleteIcon } from "@/lib/icons";
import { resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// A valid stored-icon filename (32 hex + .png) with arbitrary bytes.
const ICON = "a".repeat(32) + ".png";
const ICON_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);

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

function readBackupJson(zip: Uint8Array) {
  return JSON.parse(strFromU8(unzipSync(zip)["backup.json"]));
}

describe("backup export/import", () => {
  it("produces a ZIP archive whose backup.json is unencrypted for plain exports", async () => {
    await seed();
    const zip = await serializeBackup(["roles"], null);
    expect([zip[0], zip[1], zip[2], zip[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
    const env = readBackupJson(zip);
    expect(env.formatVersion).toBe(2);
    expect(env.encrypted).toBe(false);
    expect(env.data.roles).toHaveLength(1);
    expect(env.data.roles[0].name).toBe("Team");
  });

  it("encrypted export hides the payload and needs the passphrase", async () => {
    await seed();
    const zip = await serializeBackup(["users", "roles"], "pw-123");
    const json = strFromU8(unzipSync(zip)["backup.json"]);
    const env = JSON.parse(json);
    expect(env.encrypted).toBe(true);
    expect(env.data).toBeUndefined(); // ciphertext only
    expect(json).not.toContain("argon2-hash");

    // Correct passphrase decrypts, incl. credentials.
    const { data } = parseBackup(zip, "pw-123");
    expect(data.users?.[0].credentials?.passwordHash).toBe("argon2-hash");

    // Wrong / missing passphrase are rejected.
    expect(() => parseBackup(zip, "wrong")).toThrow(/passphrase|corrupt/i);
    expect(() => parseBackup(zip, null)).toThrow(/encrypted/i);
  });

  it("BUG-01: an icons-only export contains the real image files", async () => {
    await writeNamedIcon(ICON, ICON_BYTES);
    try {
      await prisma.serviceRole.create({
        data: {
          name: "WithIcon",
          links: { create: [{ title: "Iconed", url: "https://i.com", sortOrder: 0, iconPath: ICON }] },
        },
      });

      // Only "icons" selected — not users/roles. Old code produced an empty backup.
      const zip = await serializeBackup(["icons"], null);
      const entries = unzipSync(zip);
      expect(entries[`icons/${ICON}`]).toBeTruthy();
      expect(Buffer.from(entries[`icons/${ICON}`])).toEqual(ICON_BYTES);

      const parsed = parseBackup(zip, null);
      expect(parsed.iconFiles.map((f) => f.filename)).toContain(ICON);

      // Round-trip: wipe the file, restore, expect it back on disk.
      await deleteIcon(ICON);
      expect(await readIcon(ICON)).toBeNull();
      await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);
      expect(await readIcon(ICON)).toEqual(ICON_BYTES);
    } finally {
      await deleteIcon(ICON);
    }
  });

  it("still restores a legacy v1 JSON backup (icons as base64)", async () => {
    const legacy = JSON.stringify({
      app: "JonDash",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      includes: ["roles", "icons"],
      encrypted: false,
      data: {
        roles: [{ id: "r1", name: "Legacy", createdAt: new Date().toISOString(), links: [] }],
        icons: [{ filename: ICON, dataBase64: ICON_BYTES.toString("base64") }],
      },
    });
    const parsed = parseBackup(legacy, null); // string input path
    expect(parsed.includes).toEqual(["roles", "icons"]);
    expect(parsed.iconFiles).toHaveLength(0); // legacy icons live inside data
    expect(parsed.data.icons?.[0].filename).toBe(ICON);

    try {
      await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);
      expect(await readIcon(ICON)).toEqual(ICON_BYTES); // written from base64
      expect((await prisma.serviceRole.findUnique({ where: { id: "r1" } }))?.name).toBe("Legacy");
    } finally {
      await deleteIcon(ICON);
    }
  });

  it("restores a full snapshot (users, roles, links, membership, credentials)", async () => {
    const { user, role } = await seed();
    const zip = await serializeBackup(["users", "roles"], "pw-123");
    const { data, includes, iconFiles } = parseBackup(zip, "pw-123");

    await resetDb(); // simulate data loss
    expect(await prisma.user.count()).toBe(0);

    await applyRestore(data, includes, iconFiles);

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
