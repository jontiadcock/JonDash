import "server-only";
import { prisma } from "@/lib/db";
import { PERMISSION_WARNINGS, type ModulePermission } from "./types";
import { getAllModules } from "./registry";

/**
 * Module SOURCES (MOD-01 Phase 2). A source is a public git repo that publishes an
 * `addons.json` manifest per channel branch — `main` = stable, `beta` = beta — as
 * described in JonDash-addons/VERSIONING.md. The official JonDash-addons repo is
 * seeded as the default source; admins may add their own by URL, or disable/remove any.
 *
 * Everything fetched here is UNTRUSTED remote JSON, so the manifest is strictly
 * validated and sanitised before it reaches the rest of the app: ids must be safe
 * slugs, versions semver-shaped, permissions must exist in our taxonomy, and paths
 * may not escape `addons/<id>`. Invalid entries are dropped rather than trusted.
 */

export const DEFAULT_SOURCE_URL = "https://github.com/jontiadcock/JonDash-addons";
export const DEFAULT_SOURCE_NAME = "JonDash official addons";

export type ModuleChannel = "stable" | "beta";

/** Channel → the branch that carries that channel's manifest. */
export function branchForChannel(channel: ModuleChannel): string {
  return channel === "beta" ? "beta" : "main";
}

export type SourceModuleEntry = {
  id: string;
  name: string;
  description: string;
  version: string;
  minAppVersion: string;
  permissions: ModulePermission[];
  /** Helper ids this module needs; installed alongside it and shown before you confirm. */
  helpers: string[];
  path: string;
  tag: string;
  /** Optional one-line "what changed", shown on the update card. Untrusted author text. */
  notes?: string;
};

/**
 * A helper published by a source (MOD-08). Helpers are FIRST-PARTY ONLY: entries are
 * accepted solely from the official source, enforced in `fetchSourceManifest`. Without
 * that, anyone could publish a `helpers/` array and inherit the privilege helpers carry.
 */
export type SourceHelperEntry = {
  id: string;
  name: string;
  description: string;
  version: string;
  minAppVersion: string;
  /** Permissions it provides to consuming modules; drives the consent roll-up. */
  provides: ModulePermission[];
  path: string;
  tag: string;
  notes?: string;
};

export type SourceManifest = {
  manifestVersion: number;
  channel: ModuleChannel;
  name: string;
  modules: SourceModuleEntry[];
  /** Only ever populated for the official source — see sanitizeHelperEntry. */
  helpers: SourceHelperEntry[];
};

const SUPPORTED_MANIFEST_VERSION = 1;
const FETCH_TIMEOUT_MS = 8000;
const MAX_MANIFEST_BYTES = 512 * 1024; // a manifest is small; refuse anything silly

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9a-z.]+)?$/i;
const VALID_PERMISSIONS = new Set(Object.keys(PERMISSION_WARNINGS));

/** Parse a GitHub repo URL into owner/repo. Returns null if it isn't one we support. */
export function parseRepoUrl(raw: string): { owner: string; repo: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null; // no http/git/ssh — https only
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
  const parts = u.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
  return { owner, repo };
}

/** The raw manifest URL for a source repo on a given channel's branch. */
export function manifestUrlFor(repoUrl: string, channel: ModuleChannel): string | null {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;
  return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branchForChannel(channel)}/addons.json`;
}

/** Validate + sanitise one untrusted manifest entry. Returns null if unusable. */
function sanitizeEntry(raw: unknown): SourceModuleEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id.trim().toLowerCase() : "";
  if (!ID_RE.test(id)) return null;
  const version = typeof e.version === "string" ? e.version.trim() : "";
  if (!SEMVER_RE.test(version)) return null;

  const permissions = Array.isArray(e.permissions)
    ? (e.permissions.filter((p): p is ModulePermission => typeof p === "string" && VALID_PERMISSIONS.has(p)))
    : [];

  // The path must stay inside addons/<id> — never trust a remote path.
  const path = typeof e.path === "string" ? e.path.trim() : `addons/${id}`;
  if (path !== `addons/${id}`) return null;

  const tag = typeof e.tag === "string" ? e.tag.trim() : "";
  if (!tag || tag.length > 200 || /\s/.test(tag)) return null;

  // Author-written text that gets rendered to an admin on the update card — capped and
  // stripped of control characters, the same treatment `description` gets.
  const notes =
    typeof e.notes === "string"
      ? Array.from(e.notes.trim())
          .filter((ch) => {
            const c = ch.codePointAt(0)!;
            return c >= 32 && c !== 127;
          })
          .join("")
          .slice(0, 300)
      : "";

  return {
    id,
    name: typeof e.name === "string" && e.name.trim() ? e.name.trim().slice(0, 100) : id,
    description: typeof e.description === "string" ? e.description.trim().slice(0, 300) : "",
    version,
    minAppVersion: typeof e.minAppVersion === "string" && SEMVER_RE.test(e.minAppVersion.trim())
      ? e.minAppVersion.trim()
      : "0.0.0",
    permissions: [...new Set(permissions)],
    helpers: Array.isArray(e.helpers)
      ? [...new Set(e.helpers.filter((h): h is string => typeof h === "string" && ID_RE.test(h)))]
      : [],
    path,
    tag,
    ...(notes ? { notes } : {}),
  };
}

export class SourceError extends Error {}

/**
 * `https://github.com/<owner>/<repo>/archive/refs/tags/<tag>.zip` for a pinned tag.
 * Shared by the module and helper installers so both fetch the same immutable thing.
 * Tags are namespaced (`<id>/v<version>`), so each segment is encoded but the separators
 * are kept.
 */
export function archiveUrlForRepo(repoUrl: string, tag: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new SourceError("That source isn't a valid GitHub repository URL.");
  if (!tag || /\s/.test(tag)) throw new SourceError("That release tag is invalid.");
  const safeTag = tag.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${parsed.owner}/${parsed.repo}/archive/refs/tags/${safeTag}.zip`;
}

/**
 * Fetch + validate a source's manifest for a channel. Throws SourceError with a
 * user-facing message on any problem (offline, 404 — e.g. no beta branch — bad JSON).
 */
export async function fetchSourceManifest(
  repoUrl: string,
  channel: ModuleChannel,
): Promise<SourceManifest> {
  const url = manifestUrlFor(repoUrl, channel);
  if (!url) throw new SourceError("That doesn't look like a GitHub repository URL (https://github.com/owner/repo).");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let text: string;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "JonDash-Modules", Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) {
      throw new SourceError(
        `No \`addons.json\` on the ${branchForChannel(channel)} branch — the repo may not be a module source, or has no ${channel} channel.`,
      );
    }
    if (!res.ok) throw new SourceError(`Couldn't read that source (HTTP ${res.status}).`);
    text = await res.text();
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError("Couldn't reach that source (offline, or the repository is unavailable).");
  } finally {
    clearTimeout(timer);
  }

  if (text.length > MAX_MANIFEST_BYTES) throw new SourceError("That source's manifest is unreasonably large.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SourceError("That source's manifest isn't valid JSON.");
  }
  const m = parsed as Record<string, unknown>;
  const manifestVersion = typeof m?.manifestVersion === "number" ? m.manifestVersion : 0;
  if (manifestVersion > SUPPORTED_MANIFEST_VERSION) {
    throw new SourceError("That source needs a newer version of JonDash.");
  }
  if (manifestVersion < 1) throw new SourceError("That source's manifest is missing or malformed.");

  const modules = Array.isArray(m.modules)
    ? m.modules.map(sanitizeEntry).filter((x): x is SourceModuleEntry => x !== null)
    : [];

  // FIRST-PARTY ONLY, enforced here rather than by convention: helpers are trusted to do
  // what modules are forbidden, so a `helpers` array from anywhere but the official source
  // is ignored entirely. Otherwise publishing a helpers folder inherits that privilege.
  const helpers =
    isOfficialSource(repoUrl) && Array.isArray(m.helpers)
      ? m.helpers.map(sanitizeHelperEntry).filter((x): x is SourceHelperEntry => x !== null)
      : [];

  return {
    manifestVersion,
    channel,
    name: typeof m.name === "string" && m.name.trim() ? m.name.trim().slice(0, 100) : repoUrl,
    modules,
    helpers,
  };
}

/** Same repo as the built-in official source, ignoring case and a trailing slash. */
export function isOfficialSource(repoUrl: string): boolean {
  const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  return norm(repoUrl) === norm(DEFAULT_SOURCE_URL);
}

/** Validate a helper entry. Mirrors sanitizeEntry; `path` must be exactly `helpers/<id>`. */
function sanitizeHelperEntry(raw: unknown): SourceHelperEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id.trim().toLowerCase() : "";
  if (!ID_RE.test(id)) return null;
  const version = typeof e.version === "string" ? e.version.trim() : "";
  if (!SEMVER_RE.test(version)) return null;

  const path = typeof e.path === "string" ? e.path.trim() : `helpers/${id}`;
  if (path !== `helpers/${id}`) return null;

  const tag = typeof e.tag === "string" ? e.tag.trim() : "";
  if (!tag || tag.length > 200 || /\s/.test(tag)) return null;

  const provides = Array.isArray(e.provides)
    ? e.provides.filter((p): p is ModulePermission => typeof p === "string" && VALID_PERMISSIONS.has(p))
    : [];

  return {
    id,
    name: typeof e.name === "string" && e.name.trim() ? e.name.trim().slice(0, 100) : id,
    description: typeof e.description === "string" ? e.description.trim().slice(0, 300) : "",
    version,
    minAppVersion:
      typeof e.minAppVersion === "string" && SEMVER_RE.test(e.minAppVersion.trim())
        ? e.minAppVersion.trim()
        : "0.0.0",
    provides: [...new Set(provides)],
    path,
    tag,
  };
}

// ---- Source records (CRUD) ----

export async function listSources() {
  return prisma.moduleSource.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

/** Seed the official source once, if it isn't present. Safe to call repeatedly. */
export async function ensureDefaultSource(): Promise<void> {
  const existing = await prisma.moduleSource.findUnique({ where: { url: DEFAULT_SOURCE_URL } });
  if (existing) return;
  // Only seed if it was never added-and-removed on purpose: we seed when the table is
  // empty, so a deliberate removal of the default isn't undone on every page load.
  if ((await prisma.moduleSource.count()) > 0) return;
  await prisma.moduleSource.create({
    data: { name: DEFAULT_SOURCE_NAME, url: DEFAULT_SOURCE_URL, enabled: true, isDefault: true },
  });
}

/** Add a source by repo URL (validated + de-duplicated). Returns the created row. */
export async function addSource(rawUrl: string, name?: string) {
  const parsed = parseRepoUrl(rawUrl);
  if (!parsed) throw new SourceError("Enter a GitHub repository URL, e.g. https://github.com/owner/repo");
  const url = `https://github.com/${parsed.owner}/${parsed.repo}`;
  const existing = await prisma.moduleSource.findUnique({ where: { url } });
  if (existing) throw new SourceError("That source is already added.");
  // Verify it's really a module source before saving (stable manifest must load).
  const manifest = await fetchSourceManifest(url, "stable");
  return prisma.moduleSource.create({
    data: { name: name?.trim() || manifest.name || `${parsed.owner}/${parsed.repo}`, url, enabled: true },
  });
}

export async function setSourceEnabled(id: string, enabled: boolean) {
  await prisma.moduleSource.updateMany({ where: { id }, data: { enabled } });
}

export async function removeSource(id: string) {
  await prisma.moduleSource.deleteMany({ where: { id } });
}

/** An entry from a source, annotated with whether it's already installed here. */
export type AvailableModule = SourceModuleEntry & {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  channel: ModuleChannel;
  installed: boolean;
  installedVersion: string | null;
};

/**
 * Browse every enabled source for modules available on a channel. Errors from one
 * source never break the others — they're returned per-source for display.
 */
export async function browseAvailableModules(
  channel: ModuleChannel = "stable",
): Promise<{ modules: AvailableModule[]; errors: { source: string; message: string }[] }> {
  const sources = (await listSources()).filter((s) => s.enabled);
  const installed = new Map((await prisma.module.findMany()).map((m) => [m.id, m]));
  // A module counts as installed as soon as its code is compiled in, even before the
  // admin has enabled it (enabling is what creates the DB row).
  const compiledIn = new Set(getAllModules().map((m) => m.id));

  const modules: AvailableModule[] = [];
  const errors: { source: string; message: string }[] = [];

  for (const s of sources) {
    try {
      const manifest = await fetchSourceManifest(s.url, channel);
      for (const entry of manifest.modules) {
        const row = installed.get(entry.id);
        modules.push({
          ...entry,
          sourceId: s.id,
          sourceName: s.name,
          sourceUrl: s.url,
          channel,
          installed: !!row || compiledIn.has(entry.id),
          installedVersion: row?.version ?? null,
        });
      }
    } catch (e) {
      errors.push({ source: s.name, message: e instanceof SourceError ? e.message : "Couldn't read that source." });
    }
  }
  return { modules, errors };
}
