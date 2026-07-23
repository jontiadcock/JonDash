import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import { fetchSourceManifest, DEFAULT_SOURCE_URL } from "@/lib/modules/sources";
import { installHelper } from "@/lib/helpers/install";
import { getHelperUpdateStatus } from "@/lib/helpers/updates";
import { resolveHelperChannel } from "@/lib/helpers/channel";
import { getModuleUpdateStatus } from "@/lib/modules/updates";

/**
 * Scheduled automatic updates for modules and helpers (BUG-30).
 *
 * MOD-10 shipped the opt-in flag and the planning rules but nothing that CALLED them, so
 * the toggle set a database column and the UI said "Currently on" while no module was ever
 * updated. This is the missing half: the thing that runs.
 *
 * Two properties matter more than convenience here, and both are why this refuses more
 * than it applies:
 *
 *  - **Opt-in is per item, never global.** One tick must not hand every source — including
 *    any public repo added by URL — a standing channel to run new code on this machine.
 *  - **Consent is never implied by a schedule.** An update that asks for MORE access than
 *    the admin approved is reported and left alone, however long it waits. The same goes
 *    for a blocked update, a downgrade (that's a channel change, a decision), and a helper
 *    upgrade that would stop a dependent module working.
 *
 * Applying means a rebuild and a restart, so the CALLER owns that — this reports what it
 * did and lets the scheduler decide when to bounce the server.
 */

export type AutoUpdateOutcome = {
  /** Human-readable descriptions of what was updated, e.g. "helper filesystem@0.0.4". */
  applied: string[];
  /** Opted-in items deliberately NOT applied, each with the reason. Never silent. */
  held: string[];
  /** Something went wrong reaching a source or installing. */
  failures: string[];
};

/** True when anything is opted in at all — lets the scheduler skip the network entirely. */
export async function anythingOptedIn(): Promise<boolean> {
  const [m, h] = await Promise.all([
    prisma.module.count({ where: { autoUpdate: true } }),
    prisma.helper.count({ where: { autoUpdate: true } }),
  ]);
  return m + h > 0;
}

/**
 * Apply everything that is opted in AND needs no decision. Returns what happened.
 *
 * Does NOT rebuild or restart — the caller does, once, after this returns.
 */
export async function runAutoUpdates(): Promise<AutoUpdateOutcome> {
  const out: AutoUpdateOutcome = { applied: [], held: [], failures: [] };

  const [optedModules, optedHelpers] = await Promise.all([
    prisma.module.findMany({ where: { autoUpdate: true }, select: { id: true } }),
    prisma.helper.findMany({ where: { autoUpdate: true }, select: { id: true } }),
  ]);
  const wantModule = new Set(optedModules.map((m) => m.id));
  const wantHelper = new Set(optedHelpers.map((h) => h.id));
  if (wantModule.size === 0 && wantHelper.size === 0) return out;

  const appVersion = getAppVersion();

  // Helpers first: a module's new version may require the newer helper, and the reverse is
  // never true — a helper never depends on a module.
  if (wantHelper.size > 0) {
    const status = await getHelperUpdateStatus(true).catch((e) => {
      out.failures.push(`could not check helpers: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    for (const h of status?.helpers ?? []) {
      if (!wantHelper.has(h.id) || !h.updateAvailable || !h.latestVersion) continue;
      if (h.blockedReason) { out.held.push(`${h.name}: ${h.blockedReason}`); continue; }
      if (h.isDowngrade) { out.held.push(`${h.name}: offered version is older — that's a channel change, not an update`); continue; }
      if (h.breaksModules.length > 0) {
        out.held.push(`${h.name}: would stop ${h.breaksModules.join(", ")} working — update it yourself`);
        continue;
      }
      try {
        const channel = (await resolveHelperChannel(h.id)).channel;
        const manifest = await fetchSourceManifest(DEFAULT_SOURCE_URL, channel);
        const entry = manifest.helpers.find((x) => x.id === h.id);
        if (!entry || compareVersions(entry.minAppVersion, appVersion) > 0) {
          out.held.push(`${h.name}: not installable on this version of JonDash`);
          continue;
        }
        await installHelper(entry, channel);
        await prisma.helper.update({ where: { id: h.id }, data: { version: entry.version, channel } }).catch(() => {});
        out.applied.push(`helper ${h.id}@${entry.version}`);
      } catch (e) {
        out.failures.push(`${h.name}: ${e instanceof Error ? e.message : "update failed"}`);
      }
    }
  }

  if (wantModule.size > 0) {
    const status = await getModuleUpdateStatus(true).catch((e) => {
      out.failures.push(`could not check modules: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    const eligible: string[] = [];
    for (const m of status?.modules ?? []) {
      if (!wantModule.has(m.id) || !m.updateAvailable || !m.latestVersion) continue;
      if (m.blockedReason) { out.held.push(`${m.name}: ${m.blockedReason}`); continue; }
      if (m.isDowngrade) { out.held.push(`${m.name}: offered version is older — that's a channel change, not an update`); continue; }
      if (m.permissionsAdded.length > 0) {
        out.held.push(`${m.name}: asks for more access than you approved — approve it yourself`);
        continue;
      }
      eligible.push(m.id);
    }
    if (eligible.length > 0) {
      // An EMPTY consent set on purpose: nothing here was individually approved, and the
      // apply path must refuse anything that would need it.
      const { applyModuleUpdates } = await import("@/app/admin/updates/module-actions");
      const res = await applyModuleUpdates(eligible, new Set<string>());
      out.applied.push(...res.updated.map((id) => `module ${id}`));
      out.failures.push(...res.failures);
    }
  }

  return out;
}

/** Record what a scheduled run did. Written even when nothing was applied but something was held. */
export async function auditAutoUpdateRun(out: AutoUpdateOutcome): Promise<void> {
  if (out.applied.length === 0 && out.held.length === 0 && out.failures.length === 0) return;
  const parts = [
    out.applied.length ? `applied ${out.applied.join(", ")}` : "",
    out.held.length ? `held back ${out.held.join("; ")}` : "",
    out.failures.length ? `failed ${out.failures.join("; ")}` : "",
  ].filter(Boolean);
  await audit("updates.auto.run", { detail: parts.join(" · ").slice(0, 900) });
}
