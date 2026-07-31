import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/*
 * Zero-config secret management. The only runtime secret is an AES-256 key encrypting TOTP secrets
 * and the pre-auth cookie at rest; it is generated on first run rather than asked for.
 * ⚠ `ENCRYPTION_KEY` in the environment always wins, and such installs manage the key themselves —
 * `readSecretsFileText` returns null for them, which the backup must handle.
 */

/**
 * Where JonDash keeps its own state, and where the master encryption key lives. Resolved lazily so
 * it honours `JONDASH_DATA_DIR`, which is how tests isolate a data directory.
 *
 * ⚠ Exported on purpose (MOD-10): a helper touching the filesystem must know where the key and
 * database are in order to STEP OVER them. If a helper re-derives this and its copy goes stale, the
 * failure mode is a backup that silently includes `secrets.json` — the key that makes every TOTP
 * secret and encrypted setting readable.
 * REFS lib/config-backup.ts — the exclude list that depends on this being one definition
 *      lib/boot.ts · lib/launcher-prefs.ts · lib/modules/provenance.ts
 */
export function dataDir(): string {
  return process.env.JONDASH_DATA_DIR || path.join(process.cwd(), ".data");
}
/** ⚠ Never let this path into a backup archive or a helper's browse root.
 *  REFS lib/config-backup.ts — excluded there · lib/backup.ts — carried only as the key */
export function secretsPath(): string {
  return path.join(dataDir(), "secrets.json");
}

type Secrets = { encryptionKey: string };

let cached: Secrets | null = null;

function loadSecrets(): Secrets {
  if (cached) return cached;

  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    cached = { encryptionKey: envKey.toLowerCase() };
    return cached;
  }

  try {
    const file = secretsPath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Secrets;
      if (parsed?.encryptionKey && /^[0-9a-f]{64}$/.test(parsed.encryptionKey)) {
        cached = parsed;
        return cached;
      }
    }
  } catch {
    // fall through and regenerate
  }

  // First run: generate and persist.
  const secrets: Secrets = { encryptionKey: randomBytes(32).toString("hex") };
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(secretsPath(), JSON.stringify(secrets, null, 2), { mode: 0o600 });
  cached = secrets;
  return cached;
}

/** REFS lib/crypto.ts — the only caller; every encrypted value in the app goes through it */
export function getEncryptionKey(): Buffer {
  return Buffer.from(loadSecrets().encryptionKey, "hex");
}

/**
 * Drop the cached key so the next read picks up a new `secrets.json`. ⚠ A restore that adopts a
 * backup's key MUST call this, or the running process keeps decrypting with the old one and TOTP
 * and email fail until a restart.
 * REFS lib/backup.ts — the caller  PINS tests/integration/backup.test.ts · welcome-restore.test.ts
 */
export function reloadEncryptionKey(): void {
  cached = null;
}

/** Raw `secrets.json` text, for carrying the master key in a backup. ⚠ Null on an
 *  `ENCRYPTION_KEY` install — those manage the key themselves, and the caller must not treat that
 *  as a failure. REFS lib/backup.ts — the only caller */
export function readSecretsFileText(): string | null {
  try {
    const file = secretsPath();
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  } catch {
    /* fall through */
  }
  return null;
}

/** Adopt a backup's key and drop the cache. ⚠ Validates the 64-hex shape first — writing a
 *  corrupt blob here makes every stored secret undecryptable with no way back.
 *  REFS lib/backup.ts — the only caller · reloadEncryptionKey() above */
export function writeSecretsFileText(text: string): void {
  const parsed = JSON.parse(text) as Secrets;
  if (!parsed?.encryptionKey || !/^[0-9a-f]{64}$/i.test(parsed.encryptionKey)) {
    throw new Error("Backup key material is invalid.");
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(secretsPath(), text, { mode: 0o600 });
  cached = null;
}
