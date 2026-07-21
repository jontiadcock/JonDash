import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Generic capture/restore of the `.data` configuration directory for full server
 * backups. Deliberately an *exclude* list (not an include list) so future config
 * files are backed up automatically: everything under `.data` travels except the
 * transient/regenerable markers and the master key (handled separately as the key).
 *
 * Sensitivity: anything under `tls/` is private key material, so it's only gathered
 * for an encrypted backup. Restore writes sensitive files with mode 0600.
 */

// Resolved lazily (per call) so it honours JONDASH_DATA_DIR (test isolation /
// relocated installs), matching lib/config.ts.
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

/** Gather the `.data` config files. `includeSensitive` adds TLS private material. */
export function collectDataConfigFiles(includeSensitive: boolean): ConfigFile[] {
  const all: ConfigFile[] = [];
  walk(dataDir(), "", all);
  return includeSensitive ? all : all.filter((f) => !isSensitive(f.path));
}

/**
 * Write config files back under `.data`. Each path is confined to `.data` (a crafted
 * backup can't escape via `..`); TLS/private files are written 0600.
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
