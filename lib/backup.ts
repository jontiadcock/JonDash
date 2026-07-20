import "server-only";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { prisma } from "@/lib/db";
import { readIcon, writeNamedIcon, isValidIconFilename } from "@/lib/icons";

/**
 * Backup / restore of the JonDash dataset.
 *
 * Format v2 is a ZIP archive:
 *   - backup.json         the envelope (plain, or scrypt+AES-GCM encrypted for credentials)
 *   - icons/<filename>    the real icon image files
 * Icons live as real files in the archive (not base64 inside the JSON), and are
 * included whenever the "icons" category is selected — regardless of whether
 * users/roles are also exported.
 *
 * Format v1 (a single JSON file, icons as base64 inside it) is still accepted on
 * restore for backwards compatibility.
 *
 * Two modes, driven by whether a passphrase is supplied:
 *  - No passphrase  -> plain backup.json. Cannot include user accounts/credentials.
 *  - Passphrase set -> backup.json is AES-256-GCM (scrypt-derived key). May include everything.
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

const FORMAT_VERSION = 2; // v2 = ZIP archive; v1 (JSON) still restorable
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;
const BACKUP_JSON = "backup.json";
const ICON_PREFIX = "icons/";

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
  // v1 (legacy) backups carry icons here as base64; v2 stores them as archive files.
  icons?: { filename: string; dataBase64: string }[];
  audit?: { action: string; userId: string | null; ip: string | null; detail: string | null; createdAt: string }[];
};

/** An icon image pulled from / written to the archive. */
export type IconFile = { filename: string; data: Buffer };

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

/** Build the in-memory backup payload (users/roles/audit) for the chosen categories. */
export async function buildBackupData(
  categories: BackupCategory[],
  includeCredentials: boolean,
): Promise<BackupData> {
  const data: BackupData = {};

  if (categories.includes("users")) {
    const users = await prisma.user.findMany({
      include: {
        links: { orderBy: { sortOrder: "asc" } },
        serviceRoles: { select: { id: true } },
        backupCodes: includeCredentials ? { select: { codeHash: true, usedAt: true } } : false,
      },
    });
    data.users = users.map((u) => ({
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
    }));
  }

  if (categories.includes("roles")) {
    const roles = await prisma.serviceRole.findMany({
      include: { links: { orderBy: { sortOrder: "asc" } } },
    });
    data.roles = roles.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      links: r.links.map(toLinkExport),
    }));
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

/**
 * Collect the icon image files to archive. Gathers EVERY icon referenced by any
 * link (personal or role), independent of whether users/roles are also exported —
 * so an "icons-only" backup actually contains images (BUG-01 fix).
 */
export async function collectBackupIcons(categories: BackupCategory[]): Promise<IconFile[]> {
  if (!categories.includes("icons")) return [];
  const links = await prisma.link.findMany({
    where: { iconPath: { not: null } },
    select: { iconPath: true },
  });
  const names = new Set<string>();
  for (const l of links) if (l.iconPath) names.add(l.iconPath);

  const out: IconFile[] = [];
  for (const filename of names) {
    const buf = await readIcon(filename);
    if (buf) out.push({ filename, data: buf });
  }
  return out;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
}

/** Build the backup.json envelope string (encrypted if a passphrase is given). */
function buildEnvelopeJson(
  data: BackupData,
  categories: BackupCategory[],
  passphrase: string | null,
): string {
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

/** Serialize a backup to a ZIP archive (backup.json + icons/). */
export async function serializeBackup(
  categories: BackupCategory[],
  passphrase: string | null,
): Promise<Uint8Array> {
  const includeCredentials = !!passphrase; // credentials only travel encrypted
  const data = await buildBackupData(categories, includeCredentials);
  const icons = await collectBackupIcons(categories);

  const files: Record<string, Uint8Array> = {
    [BACKUP_JSON]: strToU8(buildEnvelopeJson(data, categories, passphrase)),
  };
  for (const icon of icons) {
    if (isValidIconFilename(icon.filename)) {
      files[ICON_PREFIX + icon.filename] = new Uint8Array(icon.data);
    }
  }
  return zipSync(files, { level: 6 });
}

export class BackupError extends Error {}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Parse the backup.json envelope (decrypting if needed) into data + includes. */
function parseEnvelope(
  jsonText: string,
  passphrase: string | null,
): { data: BackupData; includes: BackupCategory[] } {
  let env: BackupEnvelope;
  try {
    env = JSON.parse(jsonText);
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
 * Parse a backup file. Accepts a v2 ZIP archive (backup.json + icons/) or a v1
 * JSON file (legacy). Returns the data, the included categories, and any icon
 * files (from the archive; empty for legacy, where icons ride inside `data`).
 */
export function parseBackup(
  input: Uint8Array | string,
  passphrase: string | null,
): { data: BackupData; includes: BackupCategory[]; iconFiles: IconFile[] } {
  const bytes = typeof input === "string" ? strToU8(input) : input;

  if (isZip(bytes)) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new BackupError("That backup archive is corrupted or unreadable.");
    }
    const jsonBytes = entries[BACKUP_JSON];
    if (!jsonBytes) throw new BackupError("That archive isn’t a JonDash backup (no backup.json).");
    const { data, includes } = parseEnvelope(strFromU8(jsonBytes), passphrase);

    const iconFiles: IconFile[] = [];
    for (const [name, content] of Object.entries(entries)) {
      if (!name.startsWith(ICON_PREFIX)) continue;
      const filename = name.slice(ICON_PREFIX.length);
      if (isValidIconFilename(filename)) iconFiles.push({ filename, data: Buffer.from(content) });
    }
    return { data, includes, iconFiles };
  }

  // Legacy v1: a plain JSON file (icons, if any, are base64 inside `data`).
  const { data, includes } = parseEnvelope(strFromU8(bytes), passphrase);
  return { data, includes, iconFiles: [] };
}

/**
 * Full REPLACE restore of the included categories. Roles are restored before
 * users so role memberships can be reconnected. Icon files are written after the
 * DB transaction commits (the filesystem isn't transactional).
 */
export async function applyRestore(
  data: BackupData,
  includes: BackupCategory[],
  iconFiles: IconFile[] = [],
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

  // Restore icon files (best-effort) after the DB commit: v2 archive files first,
  // falling back to legacy base64 icons carried inside `data`.
  if (includes.includes("icons")) {
    if (iconFiles.length) {
      for (const icon of iconFiles) {
        await writeNamedIcon(icon.filename, icon.data).catch(() => {});
      }
    } else if (data.icons) {
      for (const icon of data.icons) {
        if (!isValidIconFilename(icon.filename)) continue;
        await writeNamedIcon(icon.filename, Buffer.from(icon.dataBase64, "base64")).catch(() => {});
      }
    }
  }
}
