import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getModuleUpdateStatus } from "./updates";

/**
 * Opt-in automatic module updates (MOD-10).
 *
 * JonDash shipped with a firm rule: *modules are never updated automatically, even when
 * JonDash installs its own updates automatically.* This does not overturn it — it narrows
 * it to "never, unless you asked for it, for that module". `Module.autoUpdate` is off by
 * default and set per module, so opting in is a deliberate act about a module you trust,
 * not one tick that hands every source a standing channel to run new code here.
 *
 * What is deliberately NOT automatic, whatever the flag says:
 *
 * - **An update that ADDS a permission.** Consent is the whole security model; an update
 *   gaining access the admin never approved must interrupt them. Reported, not applied.
 * - **A blocked update** (needs a newer JonDash, source gone, installed manually).
 * - **A downgrade.** That is a channel switch, and it is a decision.
 *
 * This only *reports* what may be applied. Doing it means a rebuild and a restart, which
 * signs everyone out, so the caller decides when — never mid-request.
 */

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
