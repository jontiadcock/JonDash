import "server-only";
import { prisma } from "@/lib/db";
import { getAllModules } from "@/lib/modules/registry";
import { readProvenance } from "@/lib/modules/provenance";
import { isOfficialSource, type ModuleChannel } from "@/lib/modules/sources";
import { helperFilesExist, ensureHelpersFor } from "./install";

/**
 * Detect — and for first-party modules, repair — a module whose declared helper isn't
 * installed (BUG-20).
 *
 * A module in that state is **silently inert**: a scheduler-style helper is imported by
 * nothing, so the build succeeds, the module looks installed and enabled, and its declared
 * work simply never runs. It happens three ways: modules installed by 1.5.0-beta.1–beta.3
 * (when helpers never installed at all, and which upgrading does NOT repair, because the
 * fix runs on install and they are already installed); an update that couldn't resolve a
 * helper and kept the module rather than destroying it; and files disappearing any other
 * way — a partial restore, a manual delete.
 *
 * **Only modules from the official source heal themselves.** Provenance records where each
 * module came from, so this is a fact rather than a guess: a third-party or sideloaded
 * module is reported and left alone. Fetching code on behalf of a module the user got from
 * somewhere else is not a decision this should make quietly.
 *
 * Healing downloads the files and regenerates the registry, but **does not restart**. A
 * helper is a compile-time import, so it only becomes active on the next rebuild — and a
 * first-party module quietly signing everyone out is exactly the surprise the governing
 * rule exists to prevent. The admin is told, and restarts when it suits them.
 */

export type HelperGap = {
  moduleId: string;
  moduleName: string;
  /** Helper ids still missing after any healing attempt. */
  missing: string[];
  /** Helper ids downloaded just now; active after the next rebuild. */
  healed: string[];
  /** From the official source, so eligible to heal itself. */
  firstParty: boolean;
  /** Why healing didn't happen or didn't work — shown to the admin as-is. */
  reason?: string;
};

/** Modules whose declared helpers aren't all present, having healed what it may. */
export async function reconcileHelpers(): Promise<HelperGap[]> {
  const enabled = new Set(
    (await prisma.module.findMany({ where: { enabled: true }, select: { id: true } })).map((r) => r.id),
  );

  const gaps: HelperGap[] = [];

  for (const def of getAllModules()) {
    if (!enabled.has(def.id)) continue; // a disabled module isn't doing anything anyway
    const declared = def.helpers ?? [];
    if (declared.length === 0) continue;

    const absent = declared.filter((h) => !helperFilesExist(h));
    if (absent.length === 0) continue;

    const prov = readProvenance(def.id);
    const firstParty = !!prov && prov.source !== "imported" && isOfficialSource(prov.source);

    if (!firstParty) {
      gaps.push({
        moduleId: def.id,
        moduleName: def.name,
        missing: absent,
        healed: [],
        firstParty: false,
        reason:
          prov?.source === "imported"
            ? "It was imported manually, so JonDash won't fetch anything on its behalf — import it again to fix it."
            : "It didn't come from the official source, so JonDash won't fetch anything on its behalf — reinstall it to fix it.",
      });
      continue;
    }

    const channel: ModuleChannel = prov.channel === "beta" ? "beta" : "stable";
    try {
      const res = await ensureHelpersFor(absent, channel);
      const healed = res.installed.map((h) => h.id);
      const stillMissing = absent.filter((h) => !healed.includes(h));
      if (healed.length > 0 || stillMissing.length > 0) {
        gaps.push({
          moduleId: def.id,
          moduleName: def.name,
          missing: stillMissing,
          healed,
          firstParty: true,
          reason: res.missing.length > 0 ? `Not published on the ${channel} channel.` : undefined,
        });
      }
    } catch (e) {
      // Offline, or the source is unreachable. Report it; try again next time.
      gaps.push({
        moduleId: def.id,
        moduleName: def.name,
        missing: absent,
        healed: [],
        firstParty: true,
        reason: e instanceof Error ? e.message : "Couldn't reach the official source.",
      });
    }
  }

  return gaps;
}
