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
import { installChannelFor } from "./channel";
import { helperIdsOf } from "@/lib/modules/types";
import { getHelperDef } from "./registry";
import { helperContext } from "./boot";
import { audit } from "@/lib/audit";
import { answersFor } from "@/lib/uninstall-questions";

/** Same reasoning as the boot budget: an uninstall must not hang the admin screen. */
const UNINSTALL_BUDGET_MS = 5000;

/**
 * For a helper declaring `uninstallMayPrompt`. ⚠ Must match the elevation timeout — the hook is
 * waiting on a person deciding a UAC prompt, and anything shorter abandons it underneath them.
 * REFS lib/elevation.ts — where that timeout is defined
 */
const UNINSTALL_PROMPT_BUDGET_MS = 600_000;

/*
 * Helper installation (MOD-08).
 *
 * ⚠ **Only from the official source.** A helper is trusted to do what modules are forbidden, so
 *   that restriction is the entire security argument — enforced here and in the manifest parser,
 *   never by convention.
 * ⚠ **Helper code is NOT run through the module verifier**: its bans — process spawning,
 *   filesystem, raw sockets — are exactly what a helper exists to do. Archive hygiene still
 *   applies, because a bad archive is a bad archive whoever wrote it.
 *
 * REFS lib/modules/sources.ts › isOfficialSource(), fetchSourceManifest() — the other enforcement
 *      lib/modules/verify.ts › ALLOWED_EXTENSIONS, LIMITS — the hygiene rules reused here
 */

const HELPERS_DIR = path.join(process.cwd(), "helpers");
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

/** Its message reaches the admin. REFS app/admin/updates/helper-actions.ts · updates/auto-run.ts */
export class HelperInstallError extends Error {}

function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return [".ts", ".tsx", ".sql", ".md", ".json", ".css", ".txt", ".svg"].includes(ext);
}

/**
 * Is a helper's code present on disk?
 * REFS lib/helpers/reconcile.ts — the self-heal pass that acts on a false
 * PINS tests/integration/helper-reconcile.test.ts
 */
export function helperFilesExist(id: string): boolean {
  return fs.existsSync(path.join(HELPERS_DIR, id, "helper.ts"));
}

/**
 * ⚠ **FILES only — never a helper's data.** A helper can own real records, and destroying them
 *   because the last dependent module happened to be uninstalled is how an install gets bricked.
 *   Reinstalling restores the helper with its history intact.
 * PINS tests/unit/helper-resolution.test.ts
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

/** Pull the helper's folder out of the archive, checking hygiene as we go. */
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

/** ⚠ Staged then swapped — a half-written helper must never be visible to the next build. */
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

/**
 * Install or replace one helper. ⚠ Official source only — see the file note.
 * REFS app/admin/updates/helper-actions.ts · app/admin/updates/selection-actions.ts ·
 *      lib/updates/auto-run.ts — the three callers
 */
export async function installHelper(entry: SourceHelperEntry, channel: ModuleChannel): Promise<void> {
  const zip = await download(archiveUrlForRepo(DEFAULT_SOURCE_URL, entry.tag));
  const files = extractHelper(zip, entry.id);
  writeHelperFiles(entry.id, files);
  void channel; // recorded on the Helper row at boot, from the definition itself
}

/** REFS ensureHelpersFor() below — the only producer; its `missing` drives the rollback. */
export type HelperResolution = {
  /** Helpers that were fetched and written. */
  installed: SourceHelperEntry[];
  /** Helpers a module asked for that the official source doesn't publish. */
  missing: string[];
};

/**
 * Make sure every helper the given modules declare is present and current. Called while installing
 * or updating a module, so the helpers arrive as one visible batch with the thing the admin picked.
 *
 * ⚠ Helpers are never installed on their own initiative, and never from anywhere but the official
 *   source.
 * REFS app/admin/modules/actions.ts › resolveHelpersOrRollBack() — rolls the module back on
 *      `missing` app/admin/updates/module-actions.ts · lib/helpers/reconcile.ts — the other callers
 */
export async function ensureHelpersFor(
  moduleHelperIds: string[],
  channel: ModuleChannel,
): Promise<HelperResolution> {
  const wanted = [...new Set(moduleHelperIds)];
  if (wanted.length === 0) return { installed: [], missing: [] };

  // ⚠ A helper is shared, so the channel is NOT simply this module's (MOD-10) — dropping to stable
  // would strip an API another dependent relies on. REFS lib/helpers/channel.ts
  const channelFor = new Map<string, ModuleChannel>();
  for (const id of wanted) channelFor.set(id, await installChannelFor(id, channel));

  const manifests = new Map<ModuleChannel, Awaited<ReturnType<typeof fetchSourceManifest>> | null>();
  for (const ch of new Set(channelFor.values())) {
    manifests.set(ch, await fetchSourceManifest(DEFAULT_SOURCE_URL, ch).catch(() => null));
  }

  const installed: SourceHelperEntry[] = [];
  const missing: string[] = [];
  const rows = new Map((await prisma.helper.findMany()).map((r) => [r.id, r]));

  for (const id of wanted) {
    const useChannel = channelFor.get(id) ?? channel;
    const entry = (manifests.get(useChannel)?.helpers ?? []).find((h) => h.id === id);
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
    await installHelper(entry, useChannel);
    // Record the channel it actually landed on, so the Helpers page and the update check
    // agree without recomputing. No-ops when the row doesn't exist yet (written at boot).
    await prisma.helper.update({ where: { id }, data: { channel: useChannel } }).catch(() => {});
    installed.push(entry);
  }
  return { installed, missing };
}

/**
 * Remove helpers nothing depends on any more. Files only. Returns the ids removed so the caller can
 * tell the admin what went and why.
 * REFS app/admin/modules/actions.ts — the caller · lib/helpers/types.ts › onUninstall — run first
 * PINS tests/unit/helper-orphan-rows.test.ts
 */
/**
 * Which helpers `pruneUnusedHelpers` WOULD remove, with no side effects — so the uninstall
 * confirmation can ask a helper its questions before anything is touched. ⚠ Same dependency logic
 * as the real prune, deliberately one source of truth.
 * REFS lib/uninstall-questions.ts — the only caller
 */
export function helpersThatWouldBePruned(removingModuleIds: string[] = []): string[] {
  const removing = new Set(removingModuleIds);
  const needed = new Set<string>();
  for (const m of getAllModules()) {
    if (removing.has(m.id)) continue;
    for (const h of helperIdsOf(m.helpers)) needed.add(h);
  }
  try {
    return fs
      .readdirSync(HELPERS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((id) => !needed.has(id) && helperFilesExist(id));
  } catch {
    return [];
  }
}

/**
 * Remove helpers nothing depends on any more. Files only. Returns the ids removed so the caller can
 * tell the admin what went and why.
 * REFS app/admin/modules/actions.ts — the caller · lib/helpers/types.ts › onUninstall — run first
 * PINS tests/unit/helper-orphan-rows.test.ts
 */
export async function pruneUnusedHelpers(
  removingModuleIds: string[] = [],
  /** Replies to `uninstallQuestions`, namespaced `helper:<id>:<questionId>`. */
  tickedAnswers: string[] = [],
): Promise<string[]> {
  // ⚠ getAllModules() is the COMPILED registry, so a module being uninstalled is still in it and
  // counts as its own dependent. Regenerating first cannot help — the process already imported it.
  const removing = new Set(removingModuleIds);
  const needed = new Set<string>();
  for (const m of getAllModules()) {
    if (removing.has(m.id)) continue;
    for (const h of helperIdsOf(m.helpers)) needed.add(h);
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

    /*
     * ⚠ Last chance for the helper to release what it created OUTSIDE JonDash — an OS grant, a
     *   scheduled task. After the next line the code that knows about it no longer exists, and a
     *   grant must not outlive the helper that justified it (OPS-18).
     * ⚠ Best-effort and bounded: a helper that throws or hangs must not leave itself half-removed,
     *   nor hang the admin screen. The failure is recorded and removal proceeds.
     */
    const def = getHelperDef(id);
    if (def?.onUninstall) {
      // ⚠ A prompting helper gets the elevation timeout, not 5s, or the prompt is abandoned under
      // the admin. Safe to block only here — this runs inside the uninstall they just clicked.
      const budget = def.uninstallMayPrompt ? UNINSTALL_PROMPT_BUDGET_MS : UNINSTALL_BUDGET_MS;
      try {
        await Promise.race([
          def.onUninstall(helperContext(def), answersFor("helper", id, tickedAnswers)),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${budget}ms`)), budget)),
        ]);
      } catch (e) {
        await audit("helper.uninstall-cleanup-failed", {
          detail: `${id}: ${e instanceof Error ? e.message : String(e)} — files removed anyway; anything it created outside JonDash may remain`,
        });
      }
    }

    removeHelperFiles(id);
    removed.push(id);
  }
  return removed;
}

export { isOfficialSource };
