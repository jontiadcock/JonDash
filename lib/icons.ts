import "server-only";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Uploaded icons are stored OUTSIDE the web root (not under /public) and are
// only ever served through the authenticated /api/icons/[id] route.
const ICONS_DIR = path.join(process.cwd(), "uploads", "icons");

// Stored files are always normalised PNGs with a random name.
const FILENAME_RE = /^[a-f0-9]{32}\.png$/;

export function isValidIconFilename(name: string): boolean {
  return FILENAME_RE.test(name);
}

export async function saveIconPng(data: Buffer): Promise<string> {
  await mkdir(ICONS_DIR, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.png`;
  await writeFile(path.join(ICONS_DIR, filename), data);
  return filename;
}

export async function readIcon(filename: string): Promise<Buffer | null> {
  if (!isValidIconFilename(filename)) return null; // guards against path traversal
  try {
    return await readFile(path.join(ICONS_DIR, filename));
  } catch {
    return null;
  }
}

export async function deleteIcon(filename: string | null | undefined): Promise<void> {
  if (!filename || !isValidIconFilename(filename)) return;
  await unlink(path.join(ICONS_DIR, filename)).catch(() => {});
}
