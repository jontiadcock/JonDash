import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { prisma } from "@/lib/db";
import { serializeBackup, parseBackup, applyRestore } from "@/lib/backup";
import { validateBackupPassphrase } from "@/lib/auth/password";
import { authenticator } from "otplib";
import { encryptString, decryptString } from "@/lib/crypto";
import { generateTotpSecret, encryptTotpSecret, verifyTotpEncrypted } from "@/lib/auth/totp";
import { reloadEncryptionKey } from "@/lib/config";
import { writeNamedIcon, readIcon, deleteIcon } from "@/lib/icons";
import { resetDb } from "../helpers";

// Isolate the .data directory (secrets key + config) into a temp dir so the backup
// tests never touch the real install.
let DATA: string;
const K1 = "a".repeat(64); // valid 64-hex keys
const K2 = "b".repeat(64);
const PASS = "Str0ng-Passphrase!"; // meets the enforced policy

function setKey(hex: string) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, "secrets.json"), JSON.stringify({ encryptionKey: hex }));
  reloadEncryptionKey();
}
function readKeyFile(): string {
  return JSON.parse(fs.readFileSync(path.join(DATA, "secrets.json"), "utf8")).encryptionKey;
}
function user(email: string) {
  return prisma.user.findFirstOrThrow({ where: { email } });
}

const ICON = "a".repeat(32) + ".png";
const ICON_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);

// vitest.config sets ENCRYPTION_KEY for the suite, which would override our file-based
// key and defeat the key-adoption tests. Drop it here (restored after) so the key
// genuinely comes from the temp secrets.json we swap.
let savedEnvKey: string | undefined;
beforeAll(() => {
  savedEnvKey = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), "jd-backup-data-"));
  process.env.JONDASH_DATA_DIR = DATA;
  setKey(K1);
});
afterAll(async () => {
  delete process.env.JONDASH_DATA_DIR;
  if (savedEnvKey !== undefined) process.env.ENCRYPTION_KEY = savedEnvKey;
  reloadEncryptionKey();
  fs.rmSync(DATA, { recursive: true, force: true });
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  // Reset the temp .data to just the K1 key between tests.
  fs.rmSync(DATA, { recursive: true, force: true });
  setKey(K1);
});

/** Seed a realistic install: admin with 2 personal services + real encrypted TOTP,
 *  a service group with 2 shared tiles, an access role, and a setting. */
async function seed() {
  const role = await prisma.serviceRole.create({
    data: {
      name: "Team",
      links: {
        create: [
          { title: "Wiki", url: "https://wiki.example", sortOrder: 0 },
          { title: "Chat", url: "https://chat.example", sortOrder: 1 },
        ],
      },
    },
  });
  const access = await prisma.accessRole.create({
    data: { name: "Auditor", permissionsJson: JSON.stringify(["audit.view"]) },
  });
  const user = await prisma.user.create({
    data: {
      email: "owner@t.local",
      role: "ADMIN",
      status: "ACTIVE",
      passwordHash: "argon2-hash",
      // Real encrypted-at-rest TOTP secret (encrypted with the current key K1).
      totpSecretEnc: encryptString("TOTP-SECRET-XYZ"),
      mfaEnabled: true,
      serviceRoles: { connect: { id: role.id } },
      accessRoles: { connect: { id: access.id } },
      links: {
        create: [
          { title: "Mail", url: "https://mail.example", sortOrder: 0 },
          { title: "Drive", url: "https://drive.example", sortOrder: 1 },
        ],
      },
      backupCodes: { create: [{ codeHash: "h1" }, { codeHash: "h2" }] },
    },
  });
  await prisma.setting.create({
    data: { scope: "global", ownerId: "", key: "login.message", valueJson: JSON.stringify("Hi"), secret: false },
  });
  return { role, access, user };
}

function envOf(zip: Uint8Array) {
  return JSON.parse(strFromU8(unzipSync(zip)["backup.json"]));
}

describe("full server backup", () => {
  it("passphrase policy: rejects weak, accepts a compliant one", () => {
    expect(validateBackupPassphrase("short")).toMatch(/12/);
    expect(validateBackupPassphrase("alllowercase1!")).toMatch(/uppercase/);
    expect(validateBackupPassphrase("NoNumberHere!!")).toMatch(/number/);
    expect(validateBackupPassphrase("NoSymbol12345")).toMatch(/symbol/);
    expect(validateBackupPassphrase(PASS)).toBeNull();
  });

  it("unencrypted export is full but omits key, credentials and secret settings", async () => {
    await seed();
    await prisma.setting.create({
      data: { scope: "global", ownerId: "", key: "email", valueJson: encryptString("smtp"), secret: true },
    });
    const zip = await serializeBackup(null);
    expect([zip[0], zip[1], zip[2], zip[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

    const env = envOf(zip);
    expect(env.formatVersion).toBe(4); // v4 = icons sealed inside the ciphertext (BUG-25)
    expect(env.encrypted).toBe(false);
    expect(env.includes).toEqual(expect.arrayContaining(["users", "roles", "access-roles", "settings"]));
    // No sensitive material.
    expect(env.data.encryptionKey).toBeUndefined();
    expect(env.data.users[0].credentials).toBeUndefined();
    expect(env.data.settings.some((s: { secret: boolean }) => s.secret)).toBe(false); // email skipped
  });

  it("encrypted export hides the payload and carries the key + credentials", async () => {
    await seed();
    const zip = await serializeBackup(PASS);
    const json = strFromU8(unzipSync(zip)["backup.json"]);
    const env = JSON.parse(json);
    expect(env.encrypted).toBe(true);
    expect(env.data).toBeUndefined();
    expect(json).not.toContain("argon2-hash");

    const { data } = parseBackup(zip, PASS);
    expect(data.users?.[0].credentials?.passwordHash).toBe("argon2-hash");
    expect(JSON.parse(data.encryptionKey!).encryptionKey).toBe(K1);

    expect(() => parseBackup(zip, "wrong")).toThrow(/passphrase|corrupt/i);
    expect(() => parseBackup(zip, null)).toThrow(/encrypted/i);
  });

  it("BUG-04: a restored authenticator secret decrypts after key adoption", async () => {
    await seed();
    const zip = await serializeBackup(PASS); // carries K1 + the encrypted TOTP secret

    // Simulate a different install: a new key that CAN'T decrypt the old secret.
    setKey(K2);
    await resetDb();

    const { data, includes, iconFiles } = parseBackup(zip, PASS);
    await applyRestore(data, includes, iconFiles); // restores users => adopts K1

    expect(readKeyFile()).toBe(K1); // the backup's key was adopted
    const restored = await prisma.user.findFirst({ where: { email: "owner@t.local" } });
    // The secret now decrypts again (this is exactly what BUG-04 broke).
    expect(decryptString(restored!.totpSecretEnc!)).toBe("TOTP-SECRET-XYZ");
  });

  it("BUG-04 end-to-end: an authenticator code still verifies after restore", async () => {
    // The real login path: generate a secret, store it encrypted, verify a live code.
    const secret = generateTotpSecret();
    await prisma.user.create({
      data: {
        email: "totp@t.local",
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash: "h",
        totpSecretEnc: encryptTotpSecret(secret), // encrypted with K1
        mfaEnabled: true,
      },
    });
    expect(verifyTotpEncrypted(authenticator.generate(secret), (await user("totp@t.local")).totpSecretEnc!)).toBe(true);

    const zip = await serializeBackup(PASS);

    // Different install (K2): the authenticator now fails — this is BUG-04.
    setKey(K2);
    expect(verifyTotpEncrypted(authenticator.generate(secret), (await user("totp@t.local")).totpSecretEnc!)).toBe(false);

    await resetDb();
    const parsed = parseBackup(zip, PASS);
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles); // adopts K1

    // The authenticator verifies again against the restored, re-decryptable secret.
    expect(verifyTotpEncrypted(authenticator.generate(secret), (await user("totp@t.local")).totpSecretEnc!)).toBe(true);
  });

  it("restores multiple services, memberships, access roles and settings", async () => {
    const { role, access, user } = await seed();
    const zip = await serializeBackup(PASS);
    const { data, includes, iconFiles } = parseBackup(zip, PASS);

    await resetDb();
    await applyRestore(data, includes, iconFiles);

    const restored = await prisma.user.findUnique({
      where: { id: user.id },
      include: { links: true, serviceRoles: true, accessRoles: true, backupCodes: true },
    });
    expect(restored?.status).toBe("ACTIVE");
    expect(restored?.links.map((l) => l.url).sort()).toEqual(["https://drive.example", "https://mail.example"]);
    expect(restored?.serviceRoles.map((r) => r.id)).toEqual([role.id]);
    expect(restored?.accessRoles.map((r) => r.id)).toEqual([access.id]);
    expect(restored?.backupCodes).toHaveLength(2);

    const g = await prisma.serviceRole.findUnique({ where: { id: role.id }, include: { links: true } });
    expect(g?.links.map((l) => l.title).sort()).toEqual(["Chat", "Wiki"]);
    expect((await prisma.accessRole.findUnique({ where: { id: access.id } }))?.name).toBe("Auditor");
    expect((await prisma.setting.findFirst({ where: { key: "login.message" } }))?.valueJson).toBe(JSON.stringify("Hi"));
  });

  it("restoring users from an UNENCRYPTED backup makes them PENDING_SETUP", async () => {
    await seed();
    const zip = await serializeBackup(null); // no credentials

    await resetDb();
    const { data, includes, iconFiles } = parseBackup(zip, null);
    await applyRestore(data, includes, iconFiles);

    const restored = await prisma.user.findFirst({ where: { email: "owner@t.local" } });
    expect(restored?.status).toBe("PENDING_SETUP");
    expect(restored?.passwordHash).toBeNull();
    expect(restored?.totpSecretEnc).toBeNull();
    expect(restored?.mfaEnabled).toBe(false);
  });

  it("selective restore applies only the chosen categories", async () => {
    const { role } = await seed();
    const zip = await serializeBackup(PASS);
    const { data, iconFiles } = parseBackup(zip, PASS);

    await resetDb();
    await applyRestore(data, ["roles"], iconFiles); // roles only

    expect(await prisma.user.count()).toBe(0); // users NOT restored
    expect(await prisma.serviceRole.findUnique({ where: { id: role.id } })).toBeTruthy();
  });

  it("backs up and restores .data config files (sensitive TLS only when encrypted)", async () => {
    await seed();
    fs.writeFileSync(path.join(DATA, "network.json"), JSON.stringify({ mode: "off", httpPort: 3000 }));
    fs.writeFileSync(path.join(DATA, "update-channel"), "beta");
    fs.mkdirSync(path.join(DATA, "tls"), { recursive: true });
    fs.writeFileSync(path.join(DATA, "tls", "privkey.pem"), "PRIVATE");

    // Unencrypted: TLS private material is excluded.
    const plain = parseBackup(await serializeBackup(null), null);
    const plainPaths = (plain.data.config ?? []).map((c) => c.path);
    expect(plainPaths).toContain("network.json");
    expect(plainPaths).toContain("update-channel");
    expect(plainPaths.some((p) => p.startsWith("tls/"))).toBe(false);

    // Encrypted: includes TLS.
    const enc = parseBackup(await serializeBackup(PASS), PASS);
    expect((enc.data.config ?? []).some((c) => c.path === "tls/privkey.pem")).toBe(true);

    // Round-trip: wipe the config files, restore config, expect them back.
    fs.rmSync(path.join(DATA, "network.json"));
    fs.rmSync(path.join(DATA, "tls", "privkey.pem"));
    await applyRestore(enc.data, ["config"], enc.iconFiles);
    expect(fs.readFileSync(path.join(DATA, "network.json"), "utf8")).toContain("3000");
    expect(fs.readFileSync(path.join(DATA, "tls", "privkey.pem"), "utf8")).toBe("PRIVATE");
  });

  it("still restores a v2 archive; rejects v1 and non-archives", async () => {
    // Hand-build a minimal v2 backup (older shape: no config/key/access-roles).
    const v2 = zipSync({
      "backup.json": strToU8(
        JSON.stringify({
          app: "JonDash",
          formatVersion: 2,
          exportedAt: new Date().toISOString(),
          includes: ["roles"],
          encrypted: false,
          data: { roles: [{ id: "r1", name: "Legacy", createdAt: new Date().toISOString(), links: [] }] },
        }),
      ),
    });
    const parsed = parseBackup(v2, null);
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);
    expect((await prisma.serviceRole.findUnique({ where: { id: "r1" } }))?.name).toBe("Legacy");

    // v1 (plain JSON, not a ZIP) is no longer accepted.
    expect(() => parseBackup('{"app":"JonDash","formatVersion":1}', null)).toThrow(/archive/i);
  });

  it("BUG-01: icons ride the archive and restore to disk", async () => {
    await writeNamedIcon(ICON, ICON_BYTES);
    try {
      await prisma.serviceRole.create({
        data: { name: "Iconed", links: { create: [{ title: "I", url: "https://i.example", sortOrder: 0, iconPath: ICON }] } },
      });
      const parsed = parseBackup(await serializeBackup(null), null);
      expect(parsed.iconFiles.map((f) => f.filename)).toContain(ICON);

      await deleteIcon(ICON);
      expect(await readIcon(ICON)).toBeNull();
      await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);
      expect(await readIcon(ICON)).toEqual(ICON_BYTES);
    } finally {
      await deleteIcon(ICON);
    }
  });
});


/**
 * BUG-25. An "encrypted" backup used to write icons/<hash>.png into the ZIP as raw bytes
 * whatever the passphrase, so anyone who opened the file got every uploaded image — in
 * practice an inventory of which services the owner runs. The promise of an encrypted
 * backup is that the backup is encrypted, not that most of it is.
 */
describe("an encrypted backup is encrypted ALL THE WAY THROUGH", () => {
  const ICON_B = "b".repeat(32) + ".png";
  const BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

  it("leaves nothing readable in the archive without the passphrase", async () => {
    await writeNamedIcon(ICON_B, BYTES);
    // collectBackupIcons only gathers icons a Link actually references.
    const role = await prisma.serviceRole.create({
      data: { name: `R${Date.now()}${Math.random()}`, links: { create: [{ title: "I", url: "https://i.example", sortOrder: 0, iconPath: ICON_B }] } },
    });
    try {
      const entries = unzipSync(await serializeBackup(PASS));
      // The ONLY entry is the sealed envelope. Not "the important part is encrypted" —
      // a container that seals only its payload grows a new leak every time it gains
      // content, which is exactly how this bug appeared.
      expect(Object.keys(entries)).toEqual(["backup.json"]);
      const env = JSON.parse(strFromU8(entries["backup.json"]!));
      expect(env.encrypted).toBe(true);
      expect(env.data).toBeUndefined();
      expect(typeof env.ciphertext).toBe("string");
    } finally {
      await prisma.serviceRole.deleteMany({ where: { id: role.id } });
      await deleteIcon(ICON_B);
    }
  });

  it("still round-trips the icons for someone who HAS the passphrase", async () => {
    await writeNamedIcon(ICON_B, BYTES);
    // collectBackupIcons only gathers icons a Link actually references.
    const role = await prisma.serviceRole.create({
      data: { name: `R${Date.now()}${Math.random()}`, links: { create: [{ title: "I", url: "https://i.example", sortOrder: 0, iconPath: ICON_B }] } },
    });
    try {
      const { includes, iconFiles } = parseBackup(await serializeBackup(PASS), PASS);
      expect(includes).toContain("icons");
      const got = iconFiles.find((f) => f.filename === ICON_B);
      expect(got).toBeTruthy();
      expect(Buffer.from(got!.data).equals(BYTES)).toBe(true);
    } finally {
      await prisma.serviceRole.deleteMany({ where: { id: role.id } });
      await deleteIcon(ICON_B);
    }
  });

  it("an UNencrypted backup still stores icons as ordinary entries", async () => {
    // Nothing to protect there, and browsable is useful — this also keeps an unencrypted
    // v4 archive byte-compatible with what a v3 reader expects.
    await writeNamedIcon(ICON_B, BYTES);
    // collectBackupIcons only gathers icons a Link actually references.
    const role = await prisma.serviceRole.create({
      data: { name: `R${Date.now()}${Math.random()}`, links: { create: [{ title: "I", url: "https://i.example", sortOrder: 0, iconPath: ICON_B }] } },
    });
    try {
      const entries = unzipSync(await serializeBackup(null));
      expect(Object.keys(entries).some((k) => k.startsWith("icons/"))).toBe(true);
    } finally {
      await prisma.serviceRole.deleteMany({ where: { id: role.id } });
      await deleteIcon(ICON_B);
    }
  });
});

describe("module data is backed up (owner ask, 2026-07-23)", () => {
  // Self-contained: resetDb does not clear Module, so each test creates and removes its
  // own row rather than leaking one into every other test's category count.
  async function withModule(fn: () => Promise<void>) {
    await prisma.module.create({
      data: { id: "demo-mod", name: "Demo", version: "1.0.0", enabled: true, source: "bundled", channel: "beta", autoUpdate: true },
    });
    try {
      await fn();
    } finally {
      await prisma.moduleRecord.deleteMany({ where: { moduleId: "demo-mod" } });
      await prisma.module.deleteMany({ where: { id: "demo-mod" } });
    }
  }

  it("carries a module's settings and stored records", async () => {
    await withModule(async () => {
      await prisma.moduleRecord.create({
        data: { moduleId: "demo-mod", key: "greeting", valueJson: JSON.stringify("hello") },
      });
      const { data, includes } = parseBackup(await serializeBackup(PASS), PASS);
      expect(includes).toContain("modules");
      const m = data.modules?.find((x) => x.id === "demo-mod");
      expect(m?.channel).toBe("beta");
      expect(m?.autoUpdate).toBe(true);
      expect(m?.records).toEqual([{ key: "greeting", valueJson: JSON.stringify("hello"), secret: false }]);
    });
  });

  it("keeps a module's SECRET records out of an UNencrypted backup", async () => {
    // They're encrypted with the install's key, which only an encrypted backup carries
    // (BUG-04). Exporting them without it restores undecryptable junk.
    await withModule(async () => {
      await prisma.moduleRecord.create({
        data: { moduleId: "demo-mod", key: "apiKey", valueJson: "ENCRYPTED-BLOB", secret: true },
      });
      const plain = parseBackup(await serializeBackup(null), null);
      expect(plain.data.modules?.[0]?.records.map((r) => r.key) ?? []).not.toContain("apiKey");

      const sealed = parseBackup(await serializeBackup(PASS), PASS);
      expect(sealed.data.modules?.[0]?.records.map((r) => r.key) ?? []).toContain("apiKey");
    });
  });

  it("restores records but never invents a Module row for code that isn't installed", async () => {
    const parsed = await withModuleParsed();
    await prisma.moduleRecord.deleteMany({});
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);
    // The module's FILES aren't in a backup, so a row would assert an install that
    // doesn't exist. Records are kept, waiting for the module to be installed.
    expect(await prisma.module.count({ where: { id: "ghost-mod" } })).toBe(0);
    expect(await prisma.moduleRecord.count({ where: { moduleId: "ghost-mod" } })).toBe(1);
  });

  async function withModuleParsed() {
    await prisma.module.create({
      data: { id: "ghost-mod", name: "Ghost", version: "1.0.0", enabled: true, source: "bundled" },
    });
    await prisma.moduleRecord.create({
      data: { moduleId: "ghost-mod", key: "k", valueJson: "1" },
    });
    const parsed = parseBackup(await serializeBackup(PASS), PASS);
    await prisma.module.deleteMany({ where: { id: "ghost-mod" } });
    return parsed;
  }
});
