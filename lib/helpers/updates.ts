import "server-only";
import { prisma } from "@/lib/db";
import {
  fetchSourceManifest,
  DEFAULT_SOURCE_URL,
  SourceError,
  type ModuleChannel,
} from "@/lib/modules/sources";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import { getAllModules } from "@/lib/modules/registry";
import { getAllHelpers } from "./registry";
import { resolveHelperChannel } from "./channel";
import { helperIdsOf } from "@/lib/modules/types";

/*
 * Helper updates (MOD-10). ⚠ Without this a helper could ship a security fix that **no existing
 * install would ever receive** — reconcile heals only *absent* helpers, so a stale-but-present one
 * was never touched, and `ensureHelpersFor` only re-installed as a side effect of a module update.
 *
 * Helpers come from the official source only, so there is exactly one manifest per channel.
 *
 * REFS lib/helpers/channel.ts › resolveHelperChannel() — which manifest to read
 *      lib/helpers/install.ts — applies what this reports · lib/updates/auto-run.ts
 *      app/admin/updates/page.tsx · app/api/update/status/route.ts — the surfaces
 * PINS tests/unit/update-cache-invalidation.test.ts
 */

export type HelperUpdate = {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string | null;
  channel: ModuleChannel;
  /** True when an admin pinned the channel rather than it being derived. */
  pinned: boolean;
  /** Modules that depend on it — a helper is never updated for its own sake. */
  dependents: string[];
  updateAvailable: boolean;
  /** Set when an update exists but can't be applied (e.g. it needs a newer JonDash). */
  blockedReason?: string;
  /** Offered version is OLDER than installed — a channel switch, not an update. */
  isDowngrade: boolean;
  /**
   * The version at which the helper last broke compatibility (its `breakingFrom`), when
   * that is NEWER than what a dependent module declares it was built against. Modules
   * named here stop working until they are updated themselves.
   */
  breaksModules: string[];
  notes?: string;
};

export type HelperUpdateStatus = {
  checkedAt: number;
  helpers: HelperUpdate[];
  errors: { source: string; message: string }[];
};

const CACHE_MS = 3 * 60 * 1000;
let cache: { at: number; status: HelperUpdateStatus } | null = null;

/**
 * ⚠ Call after anything that changes what an update check would return, or the page shows a stale
 *   answer. PINS tests/unit/update-cache-invalidation.test.ts
 */
export function invalidateHelperUpdateCache(): void {
  cache = null;
}

/**
 * What each module declares it needs from a helper. ⚠ Reading it here rather than in the registry
 * keeps the module contract additive: a module that says nothing is treated as "built against
 * whatever was current". REFS lib/modules/types.ts › ModuleHelperNeed
 */
function declaredNeed(moduleHelpers: unknown, helperId: string): string | null {
  if (!Array.isArray(moduleHelpers)) return null;
  for (const h of moduleHelpers) {
    if (typeof h === "string" && h === helperId) return null;
    if (h && typeof h === "object" && (h as { id?: unknown }).id === helperId) {
      const min = (h as { minVersion?: unknown }).minVersion;
      return typeof min === "string" ? min : null;
    }
  }
  return null;
}

/**
 * REFS app/admin/updates/page.tsx · app/api/update/status/route.ts · lib/updates/auto-run.ts ·
 *      app/admin/updates/{helper,schedule,selection}-actions.ts — eight callers
 */
export async function getHelperUpdateStatus(force = false): Promise<HelperUpdateStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;

  /*
   * ⚠ Only helpers ACTUALLY INSTALLED. A row outlives its files on purpose (pruning keeps it so a
   *   reinstall restores the data), so reading rows alone offers updates for helpers that are gone,
   *   while the page reading the registry correctly hides them.
   */
  const installedIds = new Set(getAllHelpers().map((h) => h.id));
  const rows = (await prisma.helper.findMany()).filter((r) => installedIds.has(r.id));
  const errors: { source: string; message: string }[] = [];
  const helpers: HelperUpdate[] = [];

  if (rows.length === 0) {
    const status = { checkedAt: Date.now(), helpers, errors };
    cache = { at: Date.now(), status };
    return status;
  }

  const appVersion = getAppVersion();
  const manifests = new Map<ModuleChannel, Awaited<ReturnType<typeof fetchSourceManifest>> | null>();
  async function manifestFor(channel: ModuleChannel) {
    if (manifests.has(channel)) return manifests.get(channel)!;
    try {
      const m = await fetchSourceManifest(DEFAULT_SOURCE_URL, channel);
      manifests.set(channel, m);
      return m;
    } catch (e) {
      const message = e instanceof SourceError ? e.message : "Couldn't read the official source.";
      if (!errors.some((x) => x.message === message)) errors.push({ source: "JonDash official addons", message });
      manifests.set(channel, null);
      return null;
    }
  }

  const installedModules = getAllModules();

  for (const row of rows) {
    const state = await resolveHelperChannel(row.id);
    const dependents = installedModules
      .filter((m) => helperIdsOf(m.helpers).includes(row.id))
      .map((m) => m.id);

    const manifest = await manifestFor(state.channel);
    const entry = manifest?.helpers.find((h) => h.id === row.id) ?? null;

    if (!entry) {
      helpers.push({
        id: row.id,
        name: row.name,
        installedVersion: row.version,
        latestVersion: null,
        channel: state.channel,
        pinned: state.pinned,
        dependents,
        updateAvailable: false,
        blockedReason: manifest
          ? `The official source doesn't publish it on the ${state.channel} channel.`
          : undefined,
        isDowngrade: false,
        breaksModules: [],
      });
      continue;
    }

    const cmp = compareVersions(entry.version, row.version);
    const needsNewerApp = compareVersions(entry.minAppVersion, appVersion) > 0;

    // ⚠ Dependents this update would BREAK — expected empty almost always, since helpers promise
    // never to break except for security, which is exactly why it must be surfaced loudly.
    const breaksModules = entry.breakingFrom
      ? installedModules
          .filter((m) => {
            if (!dependents.includes(m.id)) return false;
            const need = declaredNeed(m.helpers, row.id);
            // A module that declares no floor can't be shown to be safe — treat the break
            // as affecting it, since silence is not evidence of compatibility.
            return need === null || compareVersions(need, entry.breakingFrom!) < 0;
          })
          .map((m) => m.id)
      : [];

    helpers.push({
      id: row.id,
      name: entry.name || row.name,
      installedVersion: row.version,
      latestVersion: entry.version,
      channel: state.channel,
      pinned: state.pinned,
      dependents,
      // Same rule as modules: an older offering is not an update. See lib/modules/updates.ts.
      updateAvailable: cmp > 0,
      blockedReason: needsNewerApp
        ? `Needs JonDash ${entry.minAppVersion} or newer — update JonDash first.`
        : undefined,
      isDowngrade: cmp < 0,
      breaksModules,
      ...(entry.notes ? { notes: entry.notes } : {}),
    });
  }

  const status = { checkedAt: Date.now(), helpers, errors };
  cache = { at: Date.now(), status };
  return status;
}
