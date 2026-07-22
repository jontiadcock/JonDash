import "server-only";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { prisma } from "@/lib/db";
import {
  fetchSourceManifest,
  isOfficialSource,
  DEFAULT_SOURCE_URL,
  archiveUrlForRepo,
  type ModuleChannel,
  type SourceHelperEntry,
} from "@/lib/modules/sources";
import { ALLOWED_EXTENSIONS, LIMITS } from "@/lib/modules/verify";
import { getAllModules } from "@/lib/modules/registry";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";

/**
 * Helper installation (MOD-08).
 *
 * Helpers are installed from the addons repo like modules, but with one absolute
 * difference: **only from the official source**. A helper is trusted to do what modules
 * are forbidden, so that restriction is the entire security argument — enforced here and
 * in the manifest parser, never by convention.
 *
 * Helper code is NOT run through the module verifier: its bans (child_process,
 * filesystem, raw sockets) are exactly the things a helper exists to do. Archive hygiene
 * still applies — path traversal, file types, size — because a bad archive is a bad
 * archive whoever wrote it.
 */

const HELPERS_DIR = path.join(process.cwd(), "helpers");
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

export class HelperInstallError extends Error {}

function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return [".ts", ".tsx", ".sql", ".md", ".json", ".css", ".txt", ".svg"].includes(ext);
}

/** Is a helper's code present on disk? */
export function helperFilesExist(id: string): boolean {
  return fs.existsSync(path.join(HELPERS_DIR, id, "helper.ts"));
}

/**
 * Remove a helper's FILES. Its data is deliberately left alone: a helper can own real
 * records (a scheduler's run history), and destroying them because the last dependent
 * module happened to be uninstalled is the same class of mistake that has already cost
 * this project a bricked install. Reinstalling restores the helper with its data intact.
 */
export function removeHelperFiles(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new HelperInstallError("Invalid helper id.");
  fs.rmSync(path.join(HELPERS_DIR, id), { recursive: true, force: true });
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/zip" },
  }).catch((e) => {
    throw new HelperInstallError(`Couldn't reach the helper source: ${e instanceof Error ? e.message : e}`);
  });
  if (res.status === 404) throw new HelperInstallError("That helper version doesn't exist (tag not found).");
  if (!res.ok) throw new HelperInstallError(`The helper source returned ${res.status}.`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_ARCHIVE_BYTES) throw new HelperInstallError("That helper package is too large.");
  return buf;
}

type ExtractedFile = { path: string; bytes: number; data: Uint8Array; text?: string };

/** Pull `helpers/<id>/**` out of the archive, checking hygiene as we go. */
function extractHelper(zip: Uint8Array, id: string): ExtractedFile[] {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new HelperInstallError("That helper package isn't a readable archive.");
  }

  const needle = `/helpers/${id}/`;
  const out: ExtractedFile[] = [];
  let total = 0;

  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) continue;
    const norm = name.replace(/\\/g, "/");
    const at = norm.indexOf(needle);
    if (at === -1) continue;

    const rel = norm.slice(at + needle.length);
    if (!rel || rel.includes("..") || rel.startsWith("/")) {
      throw new HelperInstallError("That helper package contains an unsafe file path.");
    }
    const ext = path.extname(rel).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new HelperInstallError(`That helper contains a file type that isn't allowed ("${ext || "none"}").`);
    }
    total += data.byteLength;
    if (total > LIMITS.maxTotalBytes) throw new HelperInstallError("That helper's files are too large.");
    if (out.length >= LIMITS.maxFiles) throw new HelperInstallError("That helper contains too many files.");

    out.push({ path: rel, bytes: data.byteLength, data, text: isTextFile(rel) ? strFromU8(data) : undefined });
  }

  if (out.length === 0) throw new HelperInstallError(`The package doesn't contain helpers/${id}.`);
  if (!out.some((f) => f.path === "helper.ts")) {
    throw new HelperInstallError(`helpers/${id} has no helper.ts at its root.`);
  }
  return out;
}

/** Write a helper to disk, staged then swapped so a half-written one is never compiled. */
function writeHelperFiles(id: string, files: ExtractedFile[]): void {
  const dest = path.join(HELPERS_DIR, id);
  const staged = `${dest}.installing`;
  fs.rmSync(staged, { recursive: true, force: true });
  for (const f of files) {
    const target = path.join(staged, f.path);
    if (!path.resolve(target).startsWith(path.resolve(staged) + path.sep)) {
      fs.rmSync(staged, { recursive: true, force: true });
      throw new HelperInstallError("That helper package contains an unsafe file path.");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.data);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(staged, dest);
}

/** Install (or replace) one helper from the official source. */
export async function installHelper(entry: SourceHelperEntry, channel: ModuleChannel): Promise<void> {
  const zip = await download(archiveUrlForRepo(DEFAULT_SOURCE_URL, entry.tag));
  const files = extractHelper(zip, entry.id);
  writeHelperFiles(entry.id, files);
  void channel; // recorded on the Helper row at boot, from the definition itself
}

export type HelperResolution = {
  /** Helpers that were fetched and written. */
  installed: SourceHelperEntry[];
  /** Helpers a module asked for that the official source doesn't publish. */
  missing: string[];
};

/**
 * Make sure every helper the given modules declare is present and current.
 *
 * Called as part of installing or updating a module — the user picked the module, and the
 * helpers it needs come with it as one visible batch. They are never installed on their
 * own initiative, and never from anywhere but the official source.
 */
export async function ensureHelpersFor(
  moduleHelperIds: string[],
  channel: ModuleChannel,
): Promise<HelperResolution> {
  const wanted = [...new Set(moduleHelperIds)];
  if (wanted.length === 0) return { installed: [], missing: [] };

  const manifest = await fetchSourceManifest(DEFAULT_SOURCE_URL, channel).catch(() => null);
  const published = new Map((manifest?.helpers ?? []).map((h) => [h.id, h]));

  const installed: SourceHelperEntry[] = [];
  const missing: string[] = [];
  const rows = new Map((await prisma.helper.findMany()).map((r) => [r.id, r]));

  for (const id of wanted) {
    const entry = published.get(id);
    if (!entry) {
      missing.push(id);
      continue;
    }
    // minAppVersion was decorative until now. A helper runs privileged code at boot, so
    // installing one that needs a newer JonDash is the last thing to do quietly.
    if (compareVersions(entry.minAppVersion, getAppVersion()) > 0) {
      missing.push(`${id} (needs JonDash ${entry.minAppVersion} or newer)`);
      continue;
    }
    // Already present at this version and on disk? Leave it alone.
    if (helperFilesExist(id) && rows.get(id)?.version === entry.version) continue;
    await installHelper(entry, channel);
    installed.push(entry);
  }
  return { installed, missing };
}

/**
 * Remove helpers nothing depends on any more. Files only — see removeHelperFiles.
 * Returns the ids removed, so the caller can tell the admin what went and why.
 */
export function pruneUnusedHelpers(removingModuleIds: string[] = []): string[] {
  // getAllModules() is the COMPILED registry, so a module being uninstalled right now is
  // still in it and counts as its own dependent — nothing would ever be pruned.
  // Regenerating the registry first doesn't help either: rewriting the file can't change
  // what the running process already imported.
  const removing = new Set(removingModuleIds);
  const needed = new Set<string>();
  for (const m of getAllModules()) {
    if (removing.has(m.id)) continue;
    for (const h of m.helpers ?? []) needed.add(h);
  }

  let present: string[];
  try {
    present = fs
      .readdirSync(HELPERS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const id of present) {
    if (needed.has(id) || !helperFilesExist(id)) continue;
    removeHelperFiles(id);
    removed.push(id);
  }
  return removed;
}

export { isOfficialSource };
