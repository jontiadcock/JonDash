import "server-only";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Uploaded icons are stored OUTSIDE the web root (not under /public) and are
// only ever served through the authenticated /api/icons/[id] route.
const ICONS_DIR = path.join(process.cwd(), "uploads", "icons");

// Stored files are always normalised PNGs with a random name.
const FILENAME_RE = /^[a-f0-9]{32}\.png$/;

/** ⚠ The gate on any filename that came from a backup archive — a path here is written to disk.
 *  REFS lib/backup.ts › writeNamedIcon() — the restore path this protects */
export function isValidIconFilename(name: string): boolean {
  return FILENAME_RE.test(name);
}

/** REFS lib/security/upload.ts — the only caller; validates the bytes before this stores them */
export async function saveIconPng(data: Buffer): Promise<string> {
  await mkdir(ICONS_DIR, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.png`;
  await writeFile(path.join(ICONS_DIR, filename), data);
  return filename;
}

/** REFS app/api/icons/[id]/route.ts · app/api/branding/icon/route.ts · branding/logo/route.ts ·
 *       lib/backup.ts  PINS tests/integration/backup.test.ts */
export async function readIcon(filename: string): Promise<Buffer | null> {
  if (!isValidIconFilename(filename)) return null; // guards against path traversal
  try {
    return await readFile(path.join(ICONS_DIR, filename));
  } catch {
    return null;
  }
}

/** REFS app/admin/actions.ts — when a service tile goes · app/admin/settings/actions.ts — the logo
 *  PINS tests/integration/backup.test.ts */
export async function deleteIcon(filename: string | null | undefined): Promise<void> {
  if (!filename || !isValidIconFilename(filename)) return;
  await unlink(path.join(ICONS_DIR, filename)).catch(() => {});
}

/** Restore an icon file under its original (validated) name — used by backup import. */
/** ⚠ Restore-only: the name comes from an archive, so it MUST pass `isValidIconFilename` first.
 *  REFS lib/backup.ts — the only caller  PINS tests/integration/backup.test.ts */
export async function writeNamedIcon(filename: string, data: Buffer): Promise<boolean> {
  if (!isValidIconFilename(filename)) return false; // reject anything unexpected
  await mkdir(ICONS_DIR, { recursive: true });
  await writeFile(path.join(ICONS_DIR, filename), data);
  return true;
}
