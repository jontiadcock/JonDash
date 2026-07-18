import "server-only";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { prisma } from "@/lib/db";
import { readIcon, writeNamedIcon, isValidIconFilename } from "@/lib/icons";

/**
 * Backup / restore of the JonDash dataset.
 *
 * Two modes, driven by whether a passphrase is supplied:
 *  - No passphrase  -> plain JSON. Cannot include user accounts/credentials.
 *  - Passphrase set -> AES-256-GCM (scrypt-derived key). May include everything.
 *
 * Restore is a full REPLACE of each included category and is a major destructive
 * action (gated by step-up auth + typed confirmation in the calling action).
 */

export const BACKUP_CATEGORIES = ["users", "roles", "icons", "audit"] as const;
export type BackupCategory = (typeof BACKUP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BackupCategory, string> = {
  users: "Users & accounts",
  roles: "Roles & shared services",
  icons: "Icons",
  audit: "Audit log",
};

const FORMAT_VERSION = 1;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

type LinkExport = {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
  sortOrder: number;
  createdAt: string;
};

type BackupData = {
  users?: {
    id: string;
    email: string;
    role: "ADMIN" | "USER";
    status: "PENDING_SETUP" | "ACTIVE" | "DISABLED";
    createdAt: string;
    roleIds: string[];
    personalLinks: LinkExport[];
    credentials?: {
      passwordHash: string | null;
      totpSecretEnc: string | null;
      mfaEnabled: boolean;
      backupCodes: { codeHash: string; usedAt: string | null }[];
    };
  }[];
  roles?: { id: string; name: string; createdAt: string; links: LinkExport[] }[];
  icons?: { filename: string; dataBase64: string }[];
  audit?: { action: string; userId: string | null; ip: string | null; detail: string | null; createdAt: string }[];
};

export type BackupEnvelope = {
  app: "JonDash";
  formatVersion: number;
  exportedAt: string;
  includes: BackupCategory[];
  encrypted: boolean;
  data?: BackupData; // plaintext payload
  kdf?: { algo: "scrypt"; salt: string; N: number; r: number; p: number; keylen: number };
  iv?: string;
  tag?: string;
  ciphertext?: string;
};

function toLinkExport(l: {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
  sortOrder: number;
  createdAt: Date;
}): LinkExport {
  return {
    id: l.id,
    title: l.title,
    url: l.url,
    iconPath: l.iconPath,
    sortOrder: l.sortOrder,
    createdAt: l.createdAt.toISOString(),
  };
}

/** Build the in-memory backup payload for the chosen categories. */
export async function buildBackupData(
  categories: BackupCategory[],
  includeCredentials: boolean,
): Promise<BackupData> {
  const data: BackupData = {};
  const iconNames = new Set<string>();

  if (categories.includes("users")) {
    const users = await prisma.user.findMany({
      include: {
        links: { orderBy: { sortOrder: "asc" } },
        serviceRoles: { select: { id: true } },
        backupCodes: includeCredentials ? { select: { codeHash: true, usedAt: true } } : false,
      },
    });
    data.users = users.map((u) => {
      u.links.forEach((l) => l.iconPath && iconNames.add(l.iconPath));
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        roleIds: u.serviceRoles.map((r) => r.id),
        personalLinks: u.links.map(toLinkExport),
        credentials: includeCredentials
          ? {
              passwordHash: u.passwordHash,
              totpSecretEnc: u.totpSecretEnc,
              mfaEnabled: u.mfaEnabled,
              backupCodes: (u.backupCodes ?? []).map((c) => ({
                codeHash: c.codeHash,
                usedAt: c.usedAt ? c.usedAt.toISOString() : null,
              })),
            }
          : undefined,
      };
    });
  }

  if (categories.includes("roles")) {
    const roles = await prisma.serviceRole.findMany({
      include: { links: { orderBy: { sortOrder: "asc" } } },
    });
    data.roles = roles.map((r) => {
      r.links.forEach((l) => l.iconPath && iconNames.add(l.iconPath));
      return {
        id: r.id,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
        links: r.links.map(toLinkExport),
      };
    });
  }

  if (categories.includes("icons")) {
    const icons: NonNullable<BackupData["icons"]> = [];
    for (const filename of iconNames) {
      const buf = await readIcon(filename);
      if (buf) icons.push({ filename, dataBase64: buf.toString("base64") });
    }
    data.icons = icons;
  }

  if (categories.includes("audit")) {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    data.audit = logs.map((a) => ({
      action: a.action,
      userId: a.userId,
      ip: a.ip,
      detail: a.detail,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  return data;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
}

/** Serialize a backup to the envelope JSON string (encrypted if passphrase given). */
export async function serializeBackup(
  categories: BackupCategory[],
  passphrase: string | null,
): Promise<string> {
  const includeCredentials = !!passphrase; // credentials only travel encrypted
  const data = await buildBackupData(categories, includeCredentials);

  const base = {
    app: "JonDash" as const,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    includes: categories,
  };

  if (!passphrase) {
    const env: BackupEnvelope = { ...base, encrypted: false, data };
    return JSON.stringify(env, null, 2);
  }

  const salt = randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const env: BackupEnvelope = {
    ...base,
    encrypted: true,
    kdf: { algo: "scrypt", salt: salt.toString("base64"), ...SCRYPT },
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(env);
}

export class BackupError extends Error {}

/** Parse (and decrypt if needed) a backup file into its data + includes. */
export function parseBackup(
  fileText: string,
  passphrase: string | null,
): { data: BackupData; includes: BackupCategory[] } {
  let env: BackupEnvelope;
  try {
    env = JSON.parse(fileText);
  } catch {
    throw new BackupError("That file isn’t a valid backup (not JSON).");
  }
  if (env?.app !== "JonDash" || typeof env.formatVersion !== "number") {
    throw new BackupError("That file isn’t a JonDash backup.");
  }
  if (env.formatVersion > FORMAT_VERSION) {
    throw new BackupError("This backup was made by a newer version of JonDash.");
  }
  const includes = Array.isArray(env.includes)
    ? env.includes.filter((c): c is BackupCategory => (BACKUP_CATEGORIES as readonly string[]).includes(c))
    : [];

  if (!env.encrypted) {
    if (!env.data) throw new BackupError("Backup file is missing its data.");
    return { data: env.data, includes };
  }

  if (!passphrase) throw new BackupError("This backup is encrypted — enter its passphrase.");
  if (!env.kdf || !env.iv || !env.tag || !env.ciphertext) {
    throw new BackupError("Encrypted backup is malformed.");
  }
  try {
    const key = deriveKey(passphrase, Buffer.from(env.kdf.salt, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
    decipher.setAuthTag(Buffer.from(env.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(env.ciphertext, "base64")),
      decipher.final(),
    ]);
    return { data: JSON.parse(plaintext.toString("utf8")) as BackupData, includes };
  } catch {
    throw new BackupError("Wrong passphrase, or the backup is corrupted.");
  }
}

/**
 * Full REPLACE restore of the included categories. Roles are restored before
 * users so role memberships can be reconnected. Icon files are written after the
 * DB transaction commits (the filesystem isn't transactional).
 */
export async function applyRestore(
  data: BackupData,
  includes: BackupCategory[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Roles first (users' memberships connect to them).
    if (includes.includes("roles") && data.roles) {
      await tx.link.deleteMany({ where: { roleId: { not: null } } });
      await tx.serviceRole.deleteMany({});
      for (const r of data.roles) {
        await tx.serviceRole.create({
          data: { id: r.id, name: r.name, createdAt: new Date(r.createdAt) },
        });
        if (r.links.length) {
          await tx.link.createMany({
            data: r.links.map((l) => ({
              id: l.id,
              roleId: r.id,
              title: l.title,
              url: l.url,
              iconPath: l.iconPath,
              sortOrder: l.sortOrder,
              createdAt: new Date(l.createdAt),
            })),
          });
        }
      }
    }

    if (includes.includes("users") && data.users) {
      // Deleting users cascades their sessions, personal links, backup codes and
      // role memberships — including the acting admin (they'll re-log in after).
      await tx.user.deleteMany({});
      const existingRoleIds = new Set((await tx.serviceRole.findMany({ select: { id: true } })).map((r) => r.id));

      for (const u of data.users) {
        await tx.user.create({
          data: {
            id: u.id,
            email: u.email,
            role: u.role,
            status: u.status,
            createdAt: new Date(u.createdAt),
            passwordHash: u.credentials?.passwordHash ?? null,
            totpSecretEnc: u.credentials?.totpSecretEnc ?? null,
            mfaEnabled: u.credentials?.mfaEnabled ?? false,
            serviceRoles: {
              connect: u.roleIds.filter((id) => existingRoleIds.has(id)).map((id) => ({ id })),
            },
          },
        });
        if (u.personalLinks.length) {
          await tx.link.createMany({
            data: u.personalLinks.map((l) => ({
              id: l.id,
              userId: u.id,
              title: l.title,
              url: l.url,
              iconPath: l.iconPath,
              sortOrder: l.sortOrder,
              createdAt: new Date(l.createdAt),
            })),
          });
        }
        if (u.credentials?.backupCodes?.length) {
          await tx.backupCode.createMany({
            data: u.credentials.backupCodes.map((c) => ({
              userId: u.id,
              codeHash: c.codeHash,
              usedAt: c.usedAt ? new Date(c.usedAt) : null,
            })),
          });
        }
      }
    }

    if (includes.includes("audit") && data.audit) {
      await tx.auditLog.deleteMany({});
      if (data.audit.length) {
        // Keep userId only when that user actually exists (FK is SetNull-nullable).
        const validUserIds = new Set((await tx.user.findMany({ select: { id: true } })).map((u) => u.id));
        await tx.auditLog.createMany({
          data: data.audit.map((a) => ({
            action: a.action,
            userId: a.userId && validUserIds.has(a.userId) ? a.userId : null,
            ip: a.ip,
            detail: a.detail,
            createdAt: new Date(a.createdAt),
          })),
        });
      }
    }
  });

  // Restore icon files (best-effort) after the DB commit.
  if (includes.includes("icons") && data.icons) {
    for (const icon of data.icons) {
      if (!isValidIconFilename(icon.filename)) continue;
      await writeNamedIcon(icon.filename, Buffer.from(icon.dataBase64, "base64")).catch(() => {});
    }
  }
}
