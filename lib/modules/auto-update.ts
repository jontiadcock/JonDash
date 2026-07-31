import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getModuleUpdateStatus } from "./updates";

/*
 * Opt-in automatic module updates (MOD-10). Narrows the standing rule to "never, unless you asked
 * for it, for that module" — `Module.autoUpdate` is off by default and set per module, so opting in
 * is a deliberate act about one module rather than a standing channel for every source.
 *
 * ⚠ **Never automatic, whatever the flag says:** an update that ADDS a permission (consent is the
 *   security model, so it must interrupt), a blocked update, or a downgrade — that is a channel
 *   switch and a decision.
 * ⚠ This only **reports**. Applying means a rebuild and a restart that signs everyone out, so the
 *   caller decides when, never mid-request.
 *
 * REFS lib/modules/updates.ts › getModuleUpdateStatus() — what this filters
 *      lib/updates/auto-run.ts — the caller that decides when
 */

/** REFS lib/updates/auto-run.ts — consumes the plan. */
export type AutoUpdatePlan = {
  /** Module ids safe to update with no further input. */
  eligible: string[];
  /** Opted-in modules held back, with the reason — surfaced so it isn't silent. */
  held: { id: string; name: string; reason: string }[];
};

export async function planAutoUpdates(): Promise<AutoUpdatePlan> {
  const optedIn = await prisma.module.findMany({
    where: { autoUpdate: true },
    select: { id: true },
  });
  if (optedIn.length === 0) return { eligible: [], held: [] };

  const wanted = new Set(optedIn.map((m) => m.id));
  const status = await getModuleUpdateStatus().catch(() => null);
  if (!status) return { eligible: [], held: [] };

  const eligible: string[] = [];
  const held: { id: string; name: string; reason: string }[] = [];

  for (const m of status.modules) {
    if (!wanted.has(m.id) || !m.updateAvailable || !m.latestVersion) continue;

    if (m.blockedReason) {
      held.push({ id: m.id, name: m.name, reason: m.blockedReason });
      continue;
    }
    if (m.isDowngrade) {
      held.push({ id: m.id, name: m.name, reason: "the offered version is older — that's a channel change, not an update" });
      continue;
    }
    if (m.permissionsAdded.length > 0) {
      held.push({
        id: m.id,
        name: m.name,
        reason: "it asks for more access than you approved — review it before it's applied",
      });
      continue;
    }
    eligible.push(m.id);
  }

  if (held.length > 0) {
    await audit("module.autoupdate.held", {
      detail: held.map((h) => `${h.id}: ${h.reason}`).join(" · "),
    }).catch(() => {});
  }

  return { eligible, held };
}
