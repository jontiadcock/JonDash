import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Zero-config secret management.
 *
 * The only secret the app needs at runtime is an AES-256 key used to encrypt
 * TOTP secrets (and the short-lived pre-auth cookie) at rest. Rather than making
 * the user edit a .env file, we generate it once on first run and persist it to
 * a local data file. An ENCRYPTION_KEY environment variable, if present, always
 * takes precedence (useful for advanced/hosted setups).
 */
/**
 * Where JonDash keeps its own state, and where the master encryption key lives.
 *
 * Resolved lazily (per call) so both honour `JONDASH_DATA_DIR` — used to isolate the data
 * directory in tests, and available for advanced/relocated installs.
 *
 * **Exported deliberately (MOD-10).** A helper that touches the filesystem has to know
 * where the key and database actually are in order to step over them, and the alternative
 * is every such helper re-deriving this one line. That rule drifting is not a cosmetic
 * problem: if a helper's copy goes stale, the failure mode is a backup that silently
 * includes `secrets.json` — the key that makes every TOTP secret and encrypted setting
 * readable. One definition, imported, so it cannot drift.
 */
export function dataDir(): string {
  return process.env.JONDASH_DATA_DIR || path.join(process.cwd(), ".data");
}
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

export function getEncryptionKey(): Buffer {
  return Buffer.from(loadSecrets().encryptionKey, "hex");
}

/**
 * Drop the cached key so the next getEncryptionKey() re-reads it. Called after a
 * restore adopts a backup's key (writes a new secrets.json) so the running process
 * picks it up immediately — no restart needed for TOTP/email to decrypt again.
 * No-op when the key comes from ENCRYPTION_KEY (that always wins on next read too).
 */
export function reloadEncryptionKey(): void {
  cached = null;
}

/** Raw secrets.json text, for backing up the master key. Null if none on disk
 *  (e.g. an ENCRYPTION_KEY env install — those manage the key themselves). */
export function readSecretsFileText(): string | null {
  try {
    const file = secretsPath();
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  } catch {
    /* fall through */
  }
  return null;
}

/** Write secrets.json (adopt a backup's key) and drop the cache. Validates it holds
 *  a 64-hex key so a corrupt blob can't brick decryption. */
export function writeSecretsFileText(text: string): void {
  const parsed = JSON.parse(text) as Secrets;
  if (!parsed?.encryptionKey || !/^[0-9a-f]{64}$/i.test(parsed.encryptionKey)) {
    throw new Error("Backup key material is invalid.");
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(secretsPath(), text, { mode: 0o600 });
  cached = null;
}
