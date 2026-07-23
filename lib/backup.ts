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
  "modules",
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
  modules: "Module data (settings, stored records, dashboard layout)",
  audit: "Audit log",
};

// v4 = icons sealed inside the encrypted payload (BUG-25); v3/v2 ZIPs still restorable;
// v1 (single JSON) dropped. The version only rises for ENCRYPTED backups — an unencrypted
// one is byte-identical to v3, so nothing that can already read v3 loses the ability.
const FORMAT_VERSION = 4;
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
  /**
   * Icon images, carried INSIDE the encrypted payload (format v4, BUG-25 fix).
   *
   * Only present in an encrypted backup. Until v4 icons were written to the ZIP as raw
   * bytes whatever the passphrase, so an "encrypted" archive handed over every uploaded
   * image — in practice an inventory of which services the owner runs. An unencrypted
   * backup still stores them as ordinary `icons/` entries: there is nothing to protect,
   * and leaving them browsable is useful.
   */
  icons?: { filename: string; dataBase64: string }[];
  /**
   * Installed modules and everything they own (owner ask, 2026-07-23).
   *
   * Backing up the app but not the modules meant restoring left a dashboard whose modules
   * had forgotten their configuration and their stored data — the module was still
   * installed, and empty.
   *
   * `records` is the generic per-module store; `layouts` is each user's widget
   * arrangement. Deliberately NOT included: the module's own `mod_<id>_*` SQL tables. Those
   * are created by the module's migrations, whose schema belongs to the module version
   * installed at restore time — writing rows from a different version back into them is how
   * you corrupt a module rather than restore it. Recorded as a known limit, not an
   * oversight; see docs/ROADMAP.md.
   */
  modules?: {
    id: string;
    version: string;
    enabled: boolean;
    source: string;
    channel: string;
    autoUpdate: boolean;
    grantedPermissions: string;
    records: { key: string; valueJson: string; secret: boolean }[];
    layouts: { userId: string; width: number; height: number; sortOrder: number }[];
  }[];
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

  // Installed modules and what they own. A restore that brought back the app but left
  // every module unconfigured and empty isn't a restore.
  const modules = await prisma.module.findMany({ orderBy: { id: "asc" } });
  if (modules.length) {
    const [records, layouts] = await Promise.all([
      prisma.moduleRecord.findMany({ orderBy: [{ moduleId: "asc" }, { key: "asc" }] }),
      prisma.moduleLayout.findMany({ orderBy: [{ moduleId: "asc" }, { sortOrder: "asc" }] }),
    ]);
    data.modules = modules.map((m) => ({
      id: m.id,
      version: m.version,
      enabled: m.enabled,
      source: m.source,
      channel: m.channel,
      autoUpdate: m.autoUpdate,
      grantedPermissions: m.grantedPermissions,
      records: records
        .filter((r) => r.moduleId === m.id)
        // A module record marked `secret` is encrypted at rest with the install's key, so
        // it only travels in an ENCRYPTED backup — which is the only kind that carries the
        // key needed to read it back (BUG-04). Otherwise it restores as undecryptable junk.
        .filter((r) => includeSensitive || !r.secret)
        .map((r) => ({ key: r.key, valueJson: r.valueJson, secret: r.secret })),
      layouts: layouts
        .filter((l) => l.moduleId === m.id)
        .map((l) => ({ userId: l.userId, width: l.width, height: l.height, sortOrder: l.sortOrder })),
    }));
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
  if (data.modules?.length) out.push("modules");
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

/**
 * Serialize a full backup to a ZIP archive.
 *
 * Encrypted (v4): ONE entry, `backup.json`, and everything is inside its ciphertext —
 * icons included. Not "encrypt the important part": a container that seals only its main
 * payload grows a new plaintext leak every time it gains content, which is exactly how
 * BUG-25 happened. Icons were added *beside* the envelope by an earlier fix and the
 * encryption boundary silently didn't move with them.
 *
 * Unencrypted (v3 layout): `backup.json` + `icons/<file>`, unchanged.
 */
export async function serializeBackup(passphrase: string | null): Promise<Uint8Array> {
  const data = await buildBackupData(!!passphrase);
  const icons = (await collectBackupIcons()).filter((i) => isValidIconFilename(i.filename));
  const includes = includesFor(data, icons.length > 0);

  if (passphrase) {
    // Fold the icons into the payload BEFORE it is encrypted, so the archive has no
    // entry a reader could open without the passphrase.
    const sealed: BackupData = {
      ...data,
      icons: icons.map((i) => ({ filename: i.filename, dataBase64: i.data.toString("base64") })),
    };
    return zipSync(
      { [BACKUP_JSON]: strToU8(buildEnvelopeJson(sealed, includes, passphrase)) },
      { level: 6 },
    );
  }

  const files: Record<string, Uint8Array> = {
    [BACKUP_JSON]: strToU8(buildEnvelopeJson(data, includes, null)),
  };
  for (const icon of icons) files[ICON_PREFIX + icon.filename] = new Uint8Array(icon.data);
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

  // v4 encrypted: icons live inside the decrypted payload. Older archives (and every
  // unencrypted one) keep them as ZIP entries, so both are read here — a format change
  // that stopped old backups restoring would be a worse bug than the one it fixed.
  for (const icon of data.icons ?? []) {
    if (isValidIconFilename(icon.filename)) {
      iconFiles.push({ filename: icon.filename, data: Buffer.from(icon.dataBase64, "base64") });
    }
  }
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

    if (restore("modules") && data.modules) {
      // Rows only — the module's FILES are not in the backup. Restoring onto an install
      // that doesn't have a module installed leaves its settings waiting for it, which is
      // the useful behaviour: install the module and its configuration is already there.
      await tx.moduleRecord.deleteMany({});
      await tx.moduleLayout.deleteMany({});

      const validUserIds = new Set((await tx.user.findMany({ select: { id: true } })).map((u) => u.id));
      for (const m of data.modules) {
        // Update, never create: a Module row asserts that code is installed on disk. Making
        // one for a module whose files are absent invents an install that isn't there, and
        // the registry is generated at build time so it would not appear anyway.
        await tx.module.updateMany({
          where: { id: m.id },
          data: {
            enabled: m.enabled,
            channel: m.channel,
            autoUpdate: m.autoUpdate,
            grantedPermissions: m.grantedPermissions,
          },
        });
        for (const r of m.records) {
          await tx.moduleRecord.create({
            data: { moduleId: m.id, key: r.key, valueJson: r.valueJson, secret: r.secret },
          });
        }
        for (const l of m.layouts) {
          // A layout belongs to a user; drop it if that user didn't come back.
          if (!validUserIds.has(l.userId)) continue;
          await tx.moduleLayout.create({
            data: { moduleId: m.id, userId: l.userId, width: l.width, height: l.height, sortOrder: l.sortOrder },
          });
        }
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
