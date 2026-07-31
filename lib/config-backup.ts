import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Capture and restore of the `.data` configuration directory for full backups.
 *
 * ⚠ An EXCLUDE list, never an include list, so a config file added later travels automatically.
 * The cost of that choice is that anything new is in a backup by default — which is why
 * `secrets.json` and the transient markers are named explicitly below.
 * ⚠ Anything under `tls/` is private key material and is gathered only for an ENCRYPTED backup.
 * REFS lib/config.ts › secretsPath() — the file this must always exclude
 *      lib/backup.ts — the only caller  PINS tests/integration/backup.test.ts
 */

// ⚠ Must match `lib/config.ts › dataDir()` — a local copy that drifts backs up the wrong tree.
function dataDir(): string {
  return process.env.JONDASH_DATA_DIR || path.join(process.cwd(), ".data");
}

// Top-level `.data` entries that must NEVER be backed up (transient launcher/update
// state, or the master key which is carried separately — see lib/config.ts).
const EXCLUDE_TOP = new Set([
  "secrets.json", // the encryption key — backed up + restored on its own
  "rollback", // update rollback snapshot (huge, regenerable)
  "built-version",
  "post-update",
  "recovery-attempted",
  "revert-attempted",
  "update-failed",
]);

/** `path` is `.data`-relative and comes from an ARCHIVE on restore — REFS writeDataConfigFiles()
 *  below, which is what confines it. */
export type ConfigFile = { path: string; data: Buffer };

/** A `.data`-relative path holding private key material (encrypted backups only). */
function isSensitive(relPath: string): boolean {
  return relPath.split(/[\\/]/)[0] === "tls";
}

function walk(dir: string, relBase: string, out: ConfigFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!relBase && EXCLUDE_TOP.has(e.name)) continue; // prune at the top level
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(abs, rel, out);
    } else if (e.isFile()) {
      try {
        out.push({ path: rel, data: fs.readFileSync(abs) });
      } catch {
        /* skip unreadable */
      }
    }
  }
}

/** Gather the `.data` config files. ⚠ `includeSensitive` adds TLS PRIVATE key material, so it
 *  follows the passphrase and never travels in an unencrypted backup.
 *  REFS lib/backup.ts — the only caller  PINS tests/integration/backup.test.ts */
export function collectDataConfigFiles(includeSensitive: boolean): ConfigFile[] {
  const all: ConfigFile[] = [];
  walk(dataDir(), "", all);
  return includeSensitive ? all : all.filter((f) => !isSensitive(f.path));
}

/**
 * Write config files back under `.data`. ⚠ Every path is confined to `.data` — the names come from
 * an archive, so without the containment check a crafted backup writes anywhere via `..`.
 * Sensitive files are written 0600. REFS lib/backup.ts  PINS tests/integration/backup.test.ts
 */
export function writeDataConfigFiles(files: ConfigFile[]): void {
  const base = dataDir();
  for (const f of files) {
    const dest = path.resolve(base, f.path);
    const rel = path.relative(base, dest);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) continue; // escapes .data
    if (EXCLUDE_TOP.has(rel.split(/[\\/]/)[0])) continue; // never restore excluded/transient
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.data, { mode: isSensitive(rel) ? 0o600 : 0o644 });
  }
}
