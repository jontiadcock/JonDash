import "server-only";
import { prisma } from "@/lib/db";
import { helperIdForPermission, isValidPermission, type DeclaredPermission } from "./types";
import { getAllModules } from "./registry";

/*
 * Module SOURCES (MOD-01 Phase 2). A source is a public git repo publishing an `addons.json` per
 * channel branch — `main` = stable, `beta` = beta. The official repo is seeded as the default.
 *
 * ⚠ **Everything fetched here is UNTRUSTED remote JSON.** Ids must be safe slugs, versions
 *   semver-shaped, permissions well-formed, and no path may escape `addons/<id>`. An invalid entry is
 *   **dropped** — except where dropping would hide a capability from the admin, where the whole entry
 *   is **refused** instead.
 * REFS lib/modules/verify.ts — the second gate, on the downloaded folder rather than the manifest
 *      lib/modules/install.ts · lib/helpers/install.ts — consume what this returns
 * PINS tests/unit/module-sources.test.ts
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
  permissions: DeclaredPermission[];
  /** Helper ids this module needs; installed alongside it and shown before you confirm. */
  helpers: string[];
  path: string;
  tag: string;
  /** Optional one-line "what changed", shown on the update card. Untrusted author text. */
  notes?: string;
  /**
   * Pictures shown before you install. ⚠ Resolved against the **pinned tag**, so you see the picture
   * shipping with the version you are about to install, not whatever is on the branch today.
   * REFS app/api/modules/screenshot/route.ts — fetches them at that tag
   */
  screenshots?: ModuleScreenshot[];
};

/** One screenshot entry from a source manifest. Both fields are untrusted author text. */
export type ModuleScreenshot = {
  /** A filename inside the module folder — no directories, no traversal (enforced below). */
  file: string;
  /** Optional caption, plain text. */
  caption?: string;
};

/** Agreed with the add-ons session, 2026-07-27. Four, because they are downloaded by every install. */
export const MAX_SCREENSHOTS = 4;

/**
 * A filename, optionally inside **one** subdirectory — four loose images among a module's source files
 * is worse for an author than one folder.
 *
 * ⚠ **Still not a path.** One optional segment that must start with a letter or digit, so `..` cannot
 *   match, nor a leading slash, second directory, drive letter or Windows separator. The extension
 *   list is the real gate on what gets fetched.
 */
const SCREENSHOT_FILE_RE =
  /^(?:[a-z0-9][a-z0-9._-]{0,31}\/)?[a-z0-9][a-z0-9._-]{0,63}\.(png|jpg|jpeg|webp)$/i;

/**
 * One capability a helper advertises: the permission a module must declare, and the sentence the admin
 * reads before anything is installed.
 *
 * ⚠ The label is authored by the HELPER. Only safe because helpers are first-party-only, so a
 *   third-party source can never inject consent text. REFS fetchSourceManifest() below — enforces that
 */
export type SourceHelperCapability = {
  /** `<helperId>:<verb>`, namespaced to the helper that provides it. */
  id: string;
  /** Plain-language effect, e.g. "Read and write files in folders you choose". */
  label: string;
};

/**
 * A helper published by a source (MOD-08). ⚠ **FIRST-PARTY ONLY** — accepted solely from the official
 * source, or anyone could publish a `helpers` array and inherit the privilege helpers carry.
 * REFS fetchSourceManifest() below — where that is enforced · lib/helpers/install.ts — the consumer
 */
export type SourceHelperEntry = {
  id: string;
  name: string;
  description: string;
  version: string;
  minAppVersion: string;
  /**
   * Capabilities provided to modules, with the wording an admin reads. Drives the consent roll-up at
   * BROWSE time, where no helper code is downloaded and no config exists, so `describe(config)` cannot
   * run — the live, config-aware sentence comes from the helper once installed.
   */
  provides: SourceHelperCapability[];
  /**
   * The version at which this helper last BROKE compatibility (MOD-10) — helpers promise never to,
   * the exception being a security fix that cannot be made additively. Declaring it lets JonDash
   * **name the modules that will stop working** rather than letting them fail silently after an update
   * nobody connected to the cause. Absent, the normal case, means never.
   */
  breakingFrom?: string;
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

/**
 * Exposed for tests. This function turns a stranger's JSON into values core will put in a URL and
 * fetch, so it is worth testing directly rather than through a network round trip.
 */
export const sanitiseModuleEntryForTest = (raw: unknown) => sanitizeEntry(raw);

/** Validate + sanitise one untrusted manifest entry. Returns null if unusable. */
function sanitizeEntry(raw: unknown): SourceModuleEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id.trim().toLowerCase() : "";
  if (!ID_RE.test(id)) return null;
  const version = typeof e.version === "string" ? e.version.trim() : "";
  if (!SEMVER_RE.test(version)) return null;

  // ⚠ An unrecognised SHAPE refuses the entry rather than being filtered away — a dropped permission
  // that happens to match the code installs with consent missing.
  if (e.permissions !== undefined && !Array.isArray(e.permissions)) return null;
  const rawPermissions = Array.isArray(e.permissions) ? e.permissions : [];
  if (!rawPermissions.every(isValidPermission)) return null;
  const permissions = rawPermissions as DeclaredPermission[];

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

  const screenshots = sanitiseScreenshots(e.screenshots);

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
    ...(screenshots.length ? { screenshots } : {}),
  };
}

/**
 * ⚠ **`file` becomes part of a URL, so it is validated rather than trusted** — the entry saying
 *   `"../../../etc/passwd"` is exactly the one worth writing. One filename segment, a known image
 *   extension, nothing else.
 *
 * A bad entry is dropped rather than failing the module: refusing to list a module because a
 * screenshot filename has a space in it would be wildly disproportionate.
 */
function sanitiseScreenshots(raw: unknown): ModuleScreenshot[] {
  if (!Array.isArray(raw)) return [];
  const out: ModuleScreenshot[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_SCREENSHOTS) break;
    const file = typeof entry?.file === "string" ? entry.file.trim() : "";
    if (!SCREENSHOT_FILE_RE.test(file)) continue;
    const rawCaption = typeof entry?.caption === "string" ? (entry.caption as string) : "";
    const caption = Array.from(rawCaption.trim())
      .filter((ch: string) => {
        const c = ch.codePointAt(0)!;
        return c >= 32 && c !== 127;
      })
      .join("")
      .slice(0, 80);
    out.push(caption ? { file, caption } : { file });
  }
  return out;
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

  // ⚠ FIRST-PARTY ONLY, enforced here rather than by convention: a `helpers` array from anywhere but
  // the official source is ignored, or publishing one would inherit the privilege helpers carry.
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

  // ⚠ `provides` is the consent roll-up, so a malformed entry REFUSES the helper rather than being
  // filtered out — dropping it publishes a helper whose capabilities the admin is never shown.
  const provides: SourceHelperCapability[] = [];
  if (e.provides !== undefined) {
    if (!Array.isArray(e.provides)) return null;
    for (const raw of e.provides) {
      if (!raw || typeof raw !== "object") return null; // includes the legacy bare string
      const c = raw as Record<string, unknown>;
      const capId = typeof c.id === "string" ? c.id.trim() : "";
      const label = typeof c.label === "string" ? c.label.trim() : "";
      // The namespace must BE this helper's id — no collisions, no shadowing a core
      // permission, and no helper describing a capability that isn't its own.
      if (helperIdForPermission(capId) !== id) return null;
      if (!label) return null;
      provides.push({ id: capId, label: label.slice(0, 200) });
    }
  }

  // ⚠ Absent is fine; present-but-invalid REFUSES the helper, as `provides` above — otherwise the
  // "which modules will this break?" warning silently disappears.
  let breakingFrom: string | undefined;
  if (e.breakingFrom !== undefined) {
    if (typeof e.breakingFrom !== "string" || !SEMVER_RE.test(e.breakingFrom.trim())) return null;
    breakingFrom = e.breakingFrom.trim();
  }

  return {
    id,
    name: typeof e.name === "string" && e.name.trim() ? e.name.trim().slice(0, 100) : id,
    description: typeof e.description === "string" ? e.description.trim().slice(0, 300) : "",
    version,
    minAppVersion:
      typeof e.minAppVersion === "string" && SEMVER_RE.test(e.minAppVersion.trim())
        ? e.minAppVersion.trim()
        : "0.0.0",
    provides,
    ...(breakingFrom ? { breakingFrom } : {}),
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
  /**
   * Every capability of every helper this module declares — shown at install **whether or not the
   * module declared the matching permission**. A module earns the `@/helpers/<id>/api` import by
   * declaring the *helper*, so consent driven by its own list would understate what accepting the
   * helper allows.
   *
   * ⚠ **The module's honesty is not load-bearing.** This is the property MOD-08 rests on.
   */
  helperCapabilities: SourceHelperCapability[];
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
      const helperById = new Map(manifest.helpers.map((h) => [h.id, h]));
      for (const entry of manifest.modules) {
        const row = installed.get(entry.id);
        // A declared helper missing from the manifest contributes nothing here, but the install
        // refuses later — so this never understates a helper that will actually be installed.
        const helperCapabilities = entry.helpers.flatMap((h) => helperById.get(h)?.provides ?? []);
        modules.push({
          ...entry,
          sourceId: s.id,
          sourceName: s.name,
          sourceUrl: s.url,
          channel,
          installed: !!row || compiledIn.has(entry.id),
          installedVersion: row?.version ?? null,
          helperCapabilities,
        });
      }
    } catch (e) {
      errors.push({ source: s.name, message: e instanceof SourceError ? e.message : "Couldn't read that source." });
    }
  }
  return { modules, errors };
}
