import "server-only";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import type { ModulePermission } from "./types";
import { verifyModuleFiles, formatIssues, ALLOWED_EXTENSIONS, LIMITS } from "./verify";
import { parseRepoUrl, type SourceModuleEntry } from "./sources";

/**
 * Module installer (MOD-01 Phase 2, chunk B) — fetch a module's pinned tag archive from
 * its source repo, verify it, and write it into `modules/<id>/`.
 *
 * The module only becomes live after a rebuild (its code is compiled into the app), which
 * `lib/modules/rebuild.ts` requests; if that build fails, the launcher removes the module
 * and rebuilds clean, so a broken module can't leave the app unbootable.
 *
 * Everything here treats the archive as hostile: it is downloaded over https from a
 * pinned tag, size-capped while unpacking, and every entry is re-checked against the
 * verifier before a single byte reaches disk.
 */

const MODULES_DIR = path.join(process.cwd(), "modules");
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

export class InstallError extends Error {}

/** Text-ish files get scanned by the verifier; the rest are checked by size/extension. */
function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return [".ts", ".tsx", ".sql", ".md", ".json", ".css", ".txt", ".svg"].includes(ext);
}

/** `https://github.com/<owner>/<repo>/archive/refs/tags/<tag>.zip` for a pinned tag. */
export function archiveUrlFor(repoUrl: string, tag: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new InstallError("That source isn't a valid GitHub repository URL.");
  if (!tag || /\s/.test(tag)) throw new InstallError("The module's release tag is invalid.");
  // Tags are namespaced `<id>/v<version>`; encode each segment but keep the separators.
  const safeTag = tag.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${parsed.owner}/${parsed.repo}/archive/refs/tags/${safeTag}.zip`;
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/zip" },
  }).catch((e) => {
    throw new InstallError(`Couldn't reach the module source: ${e instanceof Error ? e.message : e}`);
  });
  if (res.status === 404) throw new InstallError("That module version doesn't exist in the source (tag not found).");
  if (!res.ok) throw new InstallError(`The module source returned ${res.status}.`);

  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_ARCHIVE_BYTES) throw new InstallError("That module package is too large.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_ARCHIVE_BYTES) throw new InstallError("That module package is too large.");
  return buf;
}

export type ExtractedFile = { path: string; text?: string; bytes: number; data: Uint8Array };

/**
 * Pull `addons/<id>/**` out of a GitHub archive. GitHub wraps everything in a single
 * `<repo>-<tag>` folder, so the module's files are found by locating the `addons/<id>/`
 * segment rather than assuming the wrapper's name.
 */
export function extractModuleFromArchive(zip: Uint8Array, moduleId: string): ExtractedFile[] {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new InstallError("That module package isn't a readable archive.");
  }

  const needle = `/addons/${moduleId}/`;
  const out: ExtractedFile[] = [];
  let total = 0;

  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) continue; // directory entry
    const norm = name.replace(/\\/g, "/");
    const at = norm.indexOf(needle);
    if (at === -1) continue;

    const rel = norm.slice(at + needle.length);
    if (!rel || rel.includes("..") || rel.startsWith("/")) {
      throw new InstallError("That module package contains an unsafe file path.");
    }
    total += data.byteLength;
    if (total > LIMITS.maxTotalBytes) throw new InstallError("That module's files are too large.");
    if (out.length >= LIMITS.maxFiles) throw new InstallError("That module contains too many files.");

    out.push({
      path: rel,
      bytes: data.byteLength,
      data,
      text: isTextFile(rel) ? strFromU8(data) : undefined,
    });
  }

  if (out.length === 0) {
    throw new InstallError(`The package doesn't contain addons/${moduleId} — it may be the wrong tag.`);
  }
  return out;
}

/** Write a verified package to `modules/<id>/`, replacing anything already there. */
export function writeModuleFiles(moduleId: string, files: ExtractedFile[]): void {
  const dest = path.join(MODULES_DIR, moduleId);
  const staged = `${dest}.installing`;

  fs.rmSync(staged, { recursive: true, force: true });
  for (const f of files) {
    const target = path.join(staged, f.path);
    // Belt and braces: never write outside the staging folder whatever the name says.
    if (!path.resolve(target).startsWith(path.resolve(staged) + path.sep)) {
      fs.rmSync(staged, { recursive: true, force: true });
      throw new InstallError("That module package contains an unsafe file path.");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.data);
  }
  // Swap in only once every file landed, so a half-written module is never compiled.
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(staged, dest);
}

/** Delete a module's source folder (uninstall). Safe if it was never installed. */
export function removeModuleFiles(moduleId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(moduleId)) throw new InstallError("Invalid module id.");
  fs.rmSync(path.join(MODULES_DIR, moduleId), { recursive: true, force: true });
}

/** Whether a module's source is present on disk. */
export function moduleFilesExist(moduleId: string): boolean {
  return (
    fs.existsSync(path.join(MODULES_DIR, moduleId, "module.ts")) ||
    fs.existsSync(path.join(MODULES_DIR, moduleId, "module.tsx"))
  );
}

export type InstallOutcome = {
  moduleId: string;
  version: string;
  declaredPermissions: ModulePermission[];
  fileCount: number;
};

/**
 * Download → verify → write a module from a source repo at its pinned tag. Throws an
 * InstallError with a readable reason if anything fails verification; nothing is written
 * unless every check passed.
 */
export async function installModuleFromSource(
  repoUrl: string,
  entry: SourceModuleEntry,
): Promise<InstallOutcome> {
  const zip = await download(archiveUrlFor(repoUrl, entry.tag));
  const files = extractModuleFromArchive(zip, entry.id);

  const result = verifyModuleFiles(entry.id, files, entry.permissions);
  if (!result.ok) {
    throw new InstallError(`This module failed verification — ${formatIssues(result.issues)}`);
  }

  writeModuleFiles(entry.id, files);
  return {
    moduleId: entry.id,
    version: entry.version,
    declaredPermissions: result.declaredPermissions,
    fileCount: files.length,
  };
}

/**
 * Install a module the admin supplied themselves (a ZIP of the module folder, or of an
 * `addons/<id>/` layout). Verified exactly like a source install — importing your own
 * module skips the source, not the checks.
 */
export async function installModuleFromZip(zip: Uint8Array, expectedId?: string): Promise<InstallOutcome> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new InstallError("That file isn't a readable ZIP archive.");
  }

  // Find module.ts anywhere in the archive; its folder is the module root.
  const entryFile = Object.keys(entries)
    .map((n) => n.replace(/\\/g, "/"))
    .filter((n) => /(^|\/)module\.tsx?$/.test(n))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (!entryFile) throw new InstallError("That ZIP doesn't contain a module.ts at any level.");

  const root = entryFile.replace(/module\.tsx?$/, "");
  const moduleId = expectedId ?? path.basename(root.replace(/\/$/, "")) ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(moduleId)) {
    throw new InstallError("The module folder name isn't a valid module id (lowercase letters, numbers, hyphens).");
  }

  const files: ExtractedFile[] = [];
  let total = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) continue;
    const norm = name.replace(/\\/g, "/");
    if (!norm.startsWith(root)) continue;
    const rel = norm.slice(root.length);
    if (!rel || rel.includes("..") || rel.startsWith("/")) {
      throw new InstallError("That ZIP contains an unsafe file path.");
    }
    total += data.byteLength;
    if (total > LIMITS.maxTotalBytes) throw new InstallError("That module's files are too large.");
    if (files.length >= LIMITS.maxFiles) throw new InstallError("That module contains too many files.");
    files.push({ path: rel, bytes: data.byteLength, data, text: isTextFile(rel) ? strFromU8(data) : undefined });
  }

  // A sideloaded module has no manifest to cross-check, so the code is the only source
  // of truth for what it asks for — the admin consents to exactly what it declares.
  const result = verifyModuleFiles(moduleId, files);
  if (!result.ok) {
    throw new InstallError(`This module failed verification — ${formatIssues(result.issues)}`);
  }

  const version = /version\s*:\s*["']([^"']+)["']/.exec(files.find((f) => /^module\.tsx?$/.test(f.path))?.text ?? "");
  writeModuleFiles(moduleId, files);
  return {
    moduleId,
    version: version?.[1] ?? "0.0.0",
    declaredPermissions: result.declaredPermissions,
    fileCount: files.length,
  };
}

export { ALLOWED_EXTENSIONS };
