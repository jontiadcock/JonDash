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
const DATA_DIR = path.join(process.cwd(), ".data");
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");

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
    if (fs.existsSync(SECRETS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SECRETS_FILE, "utf8")) as Secrets;
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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  cached = secrets;
  return cached;
}

export function getEncryptionKey(): Buffer {
  return Buffer.from(loadSecrets().encryptionKey, "hex");
}
