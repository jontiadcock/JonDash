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
import { resolveHelperChannel } from "./channel";
import { helperIdsOf } from "@/lib/modules/types";

/**
 * Helper updates (MOD-10).
 *
 * Before this, a helper had no update path at all: `lib/modules/updates.ts` never
 * mentioned helpers, and `ensureHelpersFor` only re-installed one as a side effect of a
 * module install/update, when the versions happened to differ. A helper could therefore
 * ship a security fix that **no existing install would ever receive** — reconcile only
 * heals *absent* helpers, so a stale-but-present one was never touched.
 *
 * Helpers come from the official source only, so unlike modules there is exactly one
 * manifest to consult per channel.
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

export function invalidateHelperUpdateCache(): void {
  cache = null;
}

/**
 * What each installed module declares it needs from a helper — `helpers` may be a bare
 * id (no floor stated) or `{ id, minVersion }`. Reading it here rather than in the
 * registry keeps the module contract additive: a module that says nothing is treated as
 * "built against whatever was current", which is what every module says today.
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

export async function getHelperUpdateStatus(force = false): Promise<HelperUpdateStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;

  const rows = await prisma.helper.findMany();
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

    // Which dependents this update would BREAK: the helper declares where it last broke
    // compatibility, and any module built against something older than that stops working
    // until it is updated too. Helpers promise never to break except for security, so this
    // is expected to be empty almost always — which is exactly why it must be surfaced
    // loudly on the rare occasion it isn't.
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
