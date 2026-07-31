import "server-only";
import { prisma } from "@/lib/db";
import { getAllModules } from "@/lib/modules/registry";
import type { ModuleChannel } from "@/lib/modules/sources";
import { helperIdsOf } from "@/lib/modules/types";

/*
 * Which channel a helper is on (MOD-10). ⚠ A helper has **no channel of its own** — it is derived
 * from its dependents, taking the highest: if any is on beta, so is the helper.
 *
 * There is one copy on disk shared by every dependent, and a helper never breaks its own API, so
 * the highest channel is the only choice that cannot leave a module short of an API it needs. It
 * also stops the flip-flop where whichever module was updated last set the version.
 *
 * An admin may **pin** one explicitly to take a fix early or back one out. The pin wins; clearing
 * it returns to the derived value rather than freezing what was last installed.
 *
 * REFS lib/helpers/install.ts › installChannelFor() — applies this at install time
 *      lib/helpers/updates.ts · lib/updates/auto-run.ts — what the channel decides
 * PINS tests/integration/helper-channel.test.ts
 */

/** REFS lib/helpers/registry.ts — renders the pin state on the Shared capabilities list. */
export type HelperChannelState = {
  /** The channel actually in force. */
  channel: ModuleChannel;
  /** True when an admin pin is what decided it. */
  pinned: boolean;
  /** What it would be without a pin — so the UI can offer "back to automatic". */
  derived: ModuleChannel;
  /** Dependents that put it on beta; empty when derived is stable. Drives the "why". */
  betaDependents: string[];
};

/**
 * A helper's channel, pin included. Async because the modules' stored channels live in the DB
 * rather than the registry.
 * REFS app/admin/updates/{helper-actions,schedule-actions,selection-actions}.ts ·
 *      lib/helpers/registry.ts · lib/helpers/updates.ts · lib/updates/auto-run.ts
 */
export async function resolveHelperChannel(helperId: string): Promise<HelperChannelState> {
  // helperIdsOf, not `.includes` — `helpers` may hold `{id, minVersion}` objects, and
  // `.includes` on the union compiles happily while never matching one.
  const dependentIds = getAllModules()
    .filter((m) => helperIdsOf(m.helpers).includes(helperId))
    .map((m) => m.id);

  const rows = dependentIds.length
    ? await prisma.module.findMany({
        where: { id: { in: dependentIds } },
        select: { id: true, channel: true },
      })
    : [];

  // A module with no row isn't enabled yet, so it has no chosen channel — it contributes
  // nothing rather than defaulting to stable and dragging the helper back.
  const betaDependents = rows.filter((r) => r.channel === "beta").map((r) => r.id);
  const derived: ModuleChannel = betaDependents.length > 0 ? "beta" : "stable";

  const helper = await prisma.helper.findUnique({
    where: { id: helperId },
    select: { channelPin: true },
  });
  const pin = helper?.channelPin === "beta" || helper?.channelPin === "stable" ? helper.channelPin : null;

  return {
    channel: (pin ?? derived) as ModuleChannel,
    pinned: pin !== null,
    derived,
    betaDependents,
  };
}

/**
 * Write the resolved channel back to the Helper row, so the page and the update check agree without
 * recomputing. ⚠ Safe when the row does not exist yet — a helper's row is written at BOOT, not at
 * install — it simply does nothing.
 */
export async function syncHelperChannel(helperId: string): Promise<ModuleChannel> {
  const state = await resolveHelperChannel(helperId);
  await prisma.helper
    .update({ where: { id: helperId }, data: { channel: state.channel } })
    .catch(() => {}); // no row yet — boot will write it
  return state.channel;
}

/** Re-derive every installed helper's channel. Cheap; run after anything that changes a
 *  module's channel or its set of dependents. */
/** REFS app/admin/modules/actions.ts — after any change that moves a module's channel. */
export async function syncAllHelperChannels(): Promise<void> {
  const helpers = await prisma.helper.findMany({ select: { id: true } });
  for (const h of helpers) await syncHelperChannel(h.id);
}

/**
 * The channel to INSTALL from, given the module pulling the helper in. ⚠ **Not simply the module's
 * channel** — an existing dependent already on beta, or a pin, means dropping to stable would strip
 * an API another module relies on. Takes the highest of the two.
 * REFS lib/helpers/install.ts — the only caller
 */
export async function installChannelFor(
  helperId: string,
  requestedBy: ModuleChannel,
): Promise<ModuleChannel> {
  const state = await resolveHelperChannel(helperId);
  if (state.pinned) return state.channel; // an explicit pin wins over any single module
  return state.channel === "beta" || requestedBy === "beta" ? "beta" : "stable";
}
