import "server-only";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (memory-hard).
const ARGON2_OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * Constant-work stand-in for a real verify, for sign-in paths that have no hash
 * to check against.
 *
 * When an address doesn't exist — or the account isn't eligible to sign in — there
 * is nothing to verify, so the request would return without doing any argon2 work.
 * "No such account" then answers measurably faster than "wrong password", and that
 * gap alone is enough to test whether an address is registered. Burning the same
 * memory-hard work against a decoy closes it.
 *
 * The decoy is hashed once per process, on first use, from a value nobody knows;
 * it exists only to be expensive. Always resolves false so callers can return it
 * directly.
 */
let decoyHash: Promise<string> | null = null;

export async function verifyDecoyPassword(password: string): Promise<false> {
  decoyHash ??= hashPassword(randomBytes(32).toString("hex"));
  await verifyPassword(await decoyHash, password);
  return false;
}

/**
 * Password policy: min 12 chars, and at least three of four character classes.
 * Returns an error string, or null if acceptable.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters long.";
  if (password.length > 200) return "Password is too long.";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password));
  if (classes.length < 3) {
    return "Use at least three of: lowercase, uppercase, numbers, symbols.";
  }
  return null;
}

/**
 * Backup-passphrase policy — deliberately stricter than the login password rule:
 * an encrypted backup carries the master key + every credential, so require length
 * ≥12 with at least one uppercase letter, one number, and one symbol. Returns an
 * error string, or null if acceptable.
 */
export function validateBackupPassphrase(passphrase: string): string | null {
  if (passphrase.length < 12) return "Passphrase must be at least 12 characters long.";
  if (passphrase.length > 200) return "Passphrase is too long.";
  if (!/[A-Z]/.test(passphrase)) return "Passphrase needs at least one uppercase letter.";
  if (!/[0-9]/.test(passphrase)) return "Passphrase needs at least one number.";
  if (!/[^A-Za-z0-9]/.test(passphrase)) return "Passphrase needs at least one symbol.";
  return null;
}
