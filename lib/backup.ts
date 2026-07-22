import "server-only";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { prisma } from "@/lib/db";
import { readIcon, writeNamedIcon, isValidIconFilename } from "@/lib/icons";
import { collectDataConfigFiles, writeDataConfigFiles, type ConfigFile } from "@/lib/config-backup";
import { readSecretsFileText, writeSecretsFileText, reloadEncryptionKey } from "@/lib/config";
import { clearSettingsCache } from "@/lib/settings";

/**
 * Full server backup / selective restore.
 *
 * Export is always FULL: every table (users, roles, access-roles, the whole
 * settings table, audit), the `.data` configuration, the master encryption key,
 * and icons. Sensitive material (credentials, secret settings, TLS keys, and the
 * encryption key) is only included when the backup is passphrase-encrypted; an
 * unencrypted backup omits it, so restoring users from one recreates them as
 * PENDING_SETUP (they go through account setup again).
 *
 * Restore is SELECTIVE: the caller picks which of the categories present to apply,
 * each a full REPLACE (a major destructive action, gated by step-up + typed confirm
 * in the calling action).
 *
 * Format v3 is a ZIP: backup.json (the envelope — plain, or scrypt+AES-GCM encrypted)
 * plus icons/<file>. v2 archives still restore; v1 (single JSON) is no longer read.
 *
 * BUG-04 fix: an encrypted backup carries the install's encryption key
 * (`.data/secrets.json`). Restoring users adopts it, so TOTP secrets + email config
 * (encrypted at rest) keep working after a restore/migration — the in-process key
 * cache is reloaded so it takes effect without a restart.
 */

export const BACKUP_CATEGORIES = [
  "users",
  "roles",
  "access-roles",
  "settings",
  "config",
  "icons",
  "audit",
] as const;
export type BackupCategory = (typeof BACKUP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BackupCategory, string> = {
  users: "Users & accounts",
  roles: "Service groups & shared services",
  "access-roles": "Access roles (delegated admin)",
  settings: "Settings",
  config: "Server configuration (network, HTTPS, updates)",
  icons: "Icons",
  audit: "Audit log",
};

const FORMAT_VERSION = 3; // v3 = full ZIP; v2 (ZIP) still restorable; v1 (JSON) dropped
const MIN_RESTORABLE_VERSION = 2;
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

type SettingExport = { scope: string; ownerId: string; key: string; valueJson: string; secret: boolean };
type ConfigExport = { path: string; dataBase64: string };

type BackupData = {
  users?: {
    id: string;
    email: string;
    role: "ADMIN" | "USER";
    status: "PENDING_SETUP" | "ACTIVE" | "DISABLED";
    createdAt: string;
    roleIds: string[];
    accessRoleIds: string[];
    personalLinks: LinkExport[];
    credentials?: {
      passwordHash: string | null;
      totpSecretEnc: string | null;
      mfaEnabled: boolean;
      backupCodes: { codeHash: string; usedAt: string | null }[];
    };
  }[];
  roles?: { id: string; name: string; createdAt: string; links: LinkExport[] }[];
  accessRoles?: { id: string; name: string; permissionsJson: string; userIds: string[] }[];
  settings?: SettingExport[];
  config?: ConfigExport[];
  encryptionKey?: string; // secrets.json text — encrypted backups only (BUG-04 fix)
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

/**
 * Build the full in-memory backup payload. `includeSensitive` (set when a passphrase
 * is given) adds credentials, secret settings, TLS key material, and the master key.
 */
export async function buildBackupData(includeSensitive: boolean): Promise<BackupData> {
  const data: BackupData = {};

  const users = await prisma.user.findMany({
    include: {
      links: { orderBy: { sortOrder: "asc" } },
      serviceRoles: { select: { id: true } },
      accessRoles: { select: { id: true } },
      backupCodes: includeSensitive ? { select: { codeHash: true, usedAt: true } } : false,
    },
  });
  data.users = users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    roleIds: u.serviceRoles.map((r) => r.id),
    accessRoleIds: u.accessRoles.map((r) => r.id),
    personalLinks: u.links.map(toLinkExport),
    credentials: includeSensitive
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

  const roles = await prisma.serviceRole.findMany({
    include: { links: { orderBy: { sortOrder: "asc" } } },
  });
  if (roles.length) {
    data.roles = roles.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      links: r.links.map(toLinkExport),
    }));
  }

  const accessRoles = await prisma.accessRole.findMany({ include: { users: { select: { id: true } } } });
  if (accessRoles.length) {
    data.accessRoles = accessRoles.map((r) => ({
      id: r.id,
      name: r.name,
      permissionsJson: r.permissionsJson,
      userIds: r.users.map((u) => u.id),
    }));
  }

  // Whole settings table (generic — future keys travel automatically). Secret rows
  // (encrypted at rest, e.g. email) only ride an encrypted backup.
  const settingRows = await prisma.setting.findMany();
  const settings = settingRows
    .filter((s) => includeSensitive || !s.secret)
    .map((s) => ({ scope: s.scope, ownerId: s.ownerId, key: s.key, valueJson: s.valueJson, secret: s.secret }));
  if (settings.length) data.settings = settings;

  // `.data` configuration (network, HTTPS, update prefs, TLS). TLS private material
  // only in an encrypted backup.
  const configFiles = collectDataConfigFiles(includeSensitive);
  if (configFiles.length) {
    data.config = configFiles.map((f) => ({ path: f.path, dataBase64: f.data.toString("base64") }));
  }

  // Master encryption key (secrets.json) — encrypted backups only. Adopting it on
  // restore is what keeps TOTP + email decryptable across installs (BUG-04).
  if (includeSensitive) {
    const keyText = readSecretsFileText();
    if (keyText) data.encryptionKey = keyText;
  }

  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
  if (logs.length) {
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

/** Which categories a built payload (+ icons) actually contains. */
function includesFor(data: BackupData, hasIcons: boolean): BackupCategory[] {
  const out: BackupCategory[] = [];
  if (data.users?.length) out.push("users");
  if (data.roles?.length) out.push("roles");
  if (data.accessRoles?.length) out.push("access-roles");
  if (data.settings?.length) out.push("settings");
  if (data.config?.length) out.push("config");
  if (hasIcons) out.push("icons");
  if (data.audit?.length) out.push("audit");
  return out;
}

/**
 * Collect every icon image referenced by any link (personal or role), as real files
 * for the archive.
 */
export async function collectBackupIcons(): Promise<IconFile[]> {
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
  includes: BackupCategory[],
  passphrase: string | null,
): string {
  const base = {
    app: "JonDash" as const,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    includes,
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

/** Serialize a full backup to a ZIP archive (backup.json + icons/). */
export async function serializeBackup(passphrase: string | null): Promise<Uint8Array> {
  const data = await buildBackupData(!!passphrase);
  const icons = await collectBackupIcons();
  const includes = includesFor(data, icons.length > 0);

  const files: Record<string, Uint8Array> = {
    [BACKUP_JSON]: strToU8(buildEnvelopeJson(data, includes, passphrase)),
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
  if (env.formatVersion < MIN_RESTORABLE_VERSION) {
    throw new BackupError("This backup is too old to restore with this version of JonDash.");
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
 * Parse a backup file (v2/v3 ZIP: backup.json + icons/). Returns the data, the
 * included categories, and any icon files.
 */
export function parseBackup(
  input: Uint8Array | string,
  passphrase: string | null,
): { data: BackupData; includes: BackupCategory[]; iconFiles: IconFile[] } {
  const bytes = typeof input === "string" ? strToU8(input) : input;

  if (!isZip(bytes)) {
    throw new BackupError("That file isn’t a JonDash backup archive.");
  }

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

/**
 * Selective full REPLACE restore of the chosen categories. Roles + access roles are
 * restored before users so memberships reconnect. Filesystem writes (config, key,
 * icons) happen after the DB transaction commits.
 *
 * `includes` is the caller's selection (already intersected with what's present).
 * When users are restored from an ENCRYPTED backup, the backup's encryption key is
 * adopted so their TOTP + secret settings decrypt (BUG-04); the in-process key cache
 * is reloaded so it takes effect immediately.
 */
export async function applyRestore(
  data: BackupData,
  includes: BackupCategory[],
  iconFiles: IconFile[] = [],
): Promise<void> {
  const restore = (c: BackupCategory) => includes.includes(c);
  const adoptKey = restore("users") && !!data.encryptionKey;

  await prisma.$transaction(async (tx) => {
    // Service groups first (users' memberships connect to them).
    if (restore("roles") && data.roles) {
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

    // Access roles (delegated admin) before users too.
    if (restore("access-roles") && data.accessRoles) {
      await tx.accessRole.deleteMany({});
      for (const r of data.accessRoles) {
        await tx.accessRole.create({
          data: { id: r.id, name: r.name, permissionsJson: r.permissionsJson },
        });
      }
    }

    if (restore("users") && data.users) {
      // Deleting users cascades their sessions, personal links, backup codes and
      // role memberships — including the acting admin (they re-log in after).
      await tx.user.deleteMany({});
      const existingRoleIds = new Set((await tx.serviceRole.findMany({ select: { id: true } })).map((r) => r.id));
      const existingAccessRoleIds = new Set(
        (await tx.accessRole.findMany({ select: { id: true } })).map((r) => r.id),
      );

      for (const u of data.users) {
        const hasCreds = !!u.credentials;
        await tx.user.create({
          data: {
            id: u.id,
            email: u.email,
            role: u.role,
            // No credentials (unencrypted backup) => back to setup, per design.
            status: hasCreds ? u.status : "PENDING_SETUP",
            createdAt: new Date(u.createdAt),
            passwordHash: u.credentials?.passwordHash ?? null,
            totpSecretEnc: u.credentials?.totpSecretEnc ?? null,
            mfaEnabled: u.credentials?.mfaEnabled ?? false,
            serviceRoles: {
              connect: u.roleIds.filter((id) => existingRoleIds.has(id)).map((id) => ({ id })),
            },
            accessRoles: {
              connect: (u.accessRoleIds ?? []).filter((id) => existingAccessRoleIds.has(id)).map((id) => ({ id })),
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

    if (restore("settings") && data.settings) {
      // Only adopt secret rows (e.g. email) when the key travels too; otherwise keep
      // this server's own secret settings intact and replace just the plain ones.
      const rows = adoptKey ? data.settings : data.settings.filter((s) => !s.secret);
      if (adoptKey) {
        await tx.setting.deleteMany({});
      } else {
        await tx.setting.deleteMany({ where: { secret: false } });
      }
      for (const s of rows) {
        await tx.setting.create({
          data: { scope: s.scope, ownerId: s.ownerId, key: s.key, valueJson: s.valueJson, secret: s.secret },
        });
      }
    }

    if (restore("audit") && data.audit) {
      await tx.auditLog.deleteMany({});
      if (data.audit.length) {
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

  // ---- Filesystem phase (not transactional) ----

  if (restore("config") && data.config) {
    writeDataConfigFiles(
      data.config.map((c) => ({ path: c.path, data: Buffer.from(c.dataBase64, "base64") }) as ConfigFile),
    );
  }

  // Adopt the backup's key so restored TOTP/secret settings decrypt, then make the
  // running process pick up the new key + fresh settings without a restart.
  if (adoptKey && data.encryptionKey) {
    writeSecretsFileText(data.encryptionKey);
  }
  reloadEncryptionKey();
  if (restore("settings")) clearSettingsCache();

  if (restore("icons") && iconFiles.length) {
    for (const icon of iconFiles) {
      await writeNamedIcon(icon.filename, icon.data).catch(() => {});
    }
  }
}
