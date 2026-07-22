import "server-only";
import { prisma } from "@/lib/db";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import type { ModulePermission } from "./types";
import { parseGrants } from "./permissions";
import { fetchSourceManifest, listSources, SourceError, type ModuleChannel } from "./sources";
import { readProvenance } from "./provenance";

/**
 * Module update checking (mirrors lib/update.ts for the app itself).
 *
 * Governing rule, set by the user: **the app may update itself, a module never changes
 * without the user knowing.** So nothing here applies anything — it only reports what is
 * available, and the admin acts explicitly. The counterpart to that is that availability
 * must be *surfaced*, not left to be discovered: see `countModuleUpdates`, which the
 * Updates page and the update banner both use.
 *
 * Each module is resolved against ITS OWN channel (the `Module.channel` column), not the
 * app's — the per-module beta opt-in already exists and must be honoured here.
 */

export type ModuleUpdate = {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string | null;
  channel: ModuleChannel;
  sourceName: string;
  sourceUrl: string;
  tag: string;
  updateAvailable: boolean;
  /** Set when an update exists but can't be applied yet (e.g. needs a newer JonDash). */
  blockedReason?: string;
  /** Offered version is OLDER than installed — a channel switch, not an update. */
  isDowngrade: boolean;
  permissionsAdded: ModulePermission[];
  permissionsRemoved: ModulePermission[];
  /** One short line from the source manifest on what changed. Untrusted: capped + cleaned. */
  notes?: string;
};

export type ModuleUpdateStatus = {
  checkedAt: number;
  modules: ModuleUpdate[];
  errors: { source: string; message: string }[];
};

const CACHE_MS = 3 * 60 * 1000; // matches the app's own update check
const MAX_NOTES = 300;

let cache: { at: number; status: ModuleUpdateStatus } | null = null;

/** Manifest notes are author-controlled text rendered to an admin — cap and strip controls. */
function cleanNotes(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = Array.from(raw.trim())
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c >= 32 && c !== 127;
    })
    .join("")
    .slice(0, MAX_NOTES);
  return cleaned || undefined;
}

/**
 * What's available for every installed module. Never throws for a source problem — an
 * unreachable source becomes a row-level message so one bad source can't blank the page.
 */
export async function getModuleUpdateStatus(force = false): Promise<ModuleUpdateStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;

  const rows = await prisma.module.findMany();
  const errors: { source: string; message: string }[] = [];
  const modules: ModuleUpdate[] = [];

  if (rows.length === 0) {
    const status = { checkedAt: Date.now(), modules, errors };
    cache = { at: Date.now(), status };
    return status;
  }

  const sources = (await listSources()).filter((s) => s.enabled);
  const appVersion = getAppVersion();

  // One fetch per (source, channel) pair rather than per module.
  const manifests = new Map<string, Awaited<ReturnType<typeof fetchSourceManifest>> | null>();
  async function manifestFor(url: string, channel: ModuleChannel) {
    const key = `${url}::${channel}`;
    if (manifests.has(key)) return manifests.get(key)!;
    try {
      const m = await fetchSourceManifest(url, channel);
      manifests.set(key, m);
      return m;
    } catch (e) {
      const name = sources.find((s) => s.url === url)?.name ?? url;
      const message = e instanceof SourceError ? e.message : "Couldn't read that source.";
      if (!errors.some((x) => x.source === name && x.message === message)) errors.push({ source: name, message });
      manifests.set(key, null);
      return null;
    }
  }

  for (const row of rows) {
    const channel: ModuleChannel = row.channel === "beta" ? "beta" : "stable";
    const granted = parseGrants(row.grantedPermissions);
    const prov = readProvenance(row.id);

    // Sideloaded modules have no source to check against — say so plainly.
    if (row.source === "imported" || prov?.source === "imported") {
      modules.push({
        id: row.id,
        name: row.name,
        installedVersion: row.version,
        latestVersion: null,
        channel,
        sourceName: "Imported manually",
        sourceUrl: "",
        tag: "",
        updateAvailable: false,
        blockedReason: "Installed manually — update it by importing the new version.",
        isDowngrade: false,
        permissionsAdded: [],
        permissionsRemoved: [],
      });
      continue;
    }

    const sourceUrl = prov?.source ?? row.source;
    const source = sources.find((s) => s.url === sourceUrl);
    if (!source) {
      modules.push({
        id: row.id,
        name: row.name,
        installedVersion: row.version,
        latestVersion: null,
        channel,
        sourceName: sourceUrl || "Unknown source",
        sourceUrl: sourceUrl || "",
        tag: "",
        updateAvailable: false,
        blockedReason: "Its source isn't set up any more, so updates can't be checked.",
        isDowngrade: false,
        permissionsAdded: [],
        permissionsRemoved: [],
      });
      continue;
    }

    const manifest = await manifestFor(source.url, channel);
    const entry = manifest?.modules.find((m) => m.id === row.id);

    if (!entry) {
      modules.push({
        id: row.id,
        name: row.name,
        installedVersion: row.version,
        latestVersion: null,
        channel,
        sourceName: source.name,
        sourceUrl: source.url,
        tag: "",
        updateAvailable: false,
        blockedReason: manifest
          ? `No longer published by ${source.name} on the ${channel} channel.`
          : undefined,
        isDowngrade: false,
        permissionsAdded: [],
        permissionsRemoved: [],
      });
      continue;
    }

    const cmp = compareVersions(entry.version, row.version);
    const declared = entry.permissions;
    const blockedReason =
      compareVersions(entry.minAppVersion, appVersion) > 0
        ? `Needs JonDash ${entry.minAppVersion} or newer — update JonDash first.`
        : undefined;

    modules.push({
      id: row.id,
      name: entry.name || row.name,
      installedVersion: row.version,
      latestVersion: entry.version,
      channel,
      sourceName: source.name,
      sourceUrl: source.url,
      tag: entry.tag,
      updateAvailable: cmp !== 0 && !blockedReason,
      blockedReason,
      isDowngrade: cmp < 0,
      permissionsAdded: declared.filter((p) => !granted.includes(p)),
      permissionsRemoved: granted.filter((p) => !declared.includes(p)),
      notes: cleanNotes(entry.notes),
    });
  }

  const status = { checkedAt: Date.now(), modules, errors };
  cache = { at: Date.now(), status };
  return status;
}

/** How many modules have an update ready to apply — for the "you should look" signals. */
export async function countModuleUpdates(): Promise<number> {
  try {
    const status = await getModuleUpdateStatus();
    return status.modules.filter((m) => m.updateAvailable).length;
  } catch {
    return 0; // awareness is best-effort; it must never break a page
  }
}

/** Drop the cache — call after applying updates, or after the app itself updates (a newer
 *  app can make a module that was blocked on minAppVersion newly eligible). */
export function clearModuleUpdateCache(): void {
  cache = null;
}
