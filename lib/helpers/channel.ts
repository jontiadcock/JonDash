import "server-only";
import { prisma } from "@/lib/db";
import { getAllModules } from "@/lib/modules/registry";
import type { ModuleChannel } from "@/lib/modules/sources";
import { helperIdsOf } from "@/lib/modules/types";

/**
 * Which channel a helper is on (MOD-10).
 *
 * A helper has no channel of its own to choose. It is **derived** from the modules that
 * depend on it: if any dependent is on beta, the helper is on beta. Two reasons.
 *
 * 1. **It has to satisfy every dependent at once.** There is one copy of a helper on
 *    disk, shared by every module that declared it. Since a helper never breaks its own
 *    API, a newer version always satisfies an older consumer — so taking the highest
 *    channel is the only choice that can't leave a module short of an API it needs.
 * 2. **It stops the flip-flop.** Before this, whichever module was installed/updated last
 *    set the version — a stable module would pull `0.0.2`, then a beta module would pull
 *    `0.0.2-beta.1`, back and forth, with nothing recording why.
 *
 * An admin may **pin** a helper to a channel explicitly (`channelPin`), to take a fix
 * early or back one out. The pin wins; clearing it returns to the derived value rather
 * than freezing whatever was last installed.
 */

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
 * Resolve a helper's channel, pin included. Needs the modules' stored channels, which
 * live in the DB rather than the registry, so this is async.
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
 * Write the resolved channel back to the Helper row, so the Helpers page and the update
 * check agree without recomputing. Safe to call when the row doesn't exist yet (a helper's
 * row is written at BOOT, not at install) — it simply does nothing.
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
export async function syncAllHelperChannels(): Promise<void> {
  const helpers = await prisma.helper.findMany({ select: { id: true } });
  for (const h of helpers) await syncHelperChannel(h.id);
}

/**
 * The channel to INSTALL a helper from, given the module pulling it in.
 *
 * Not simply the module's channel: if an existing dependent is already on beta, or an
 * admin pinned it, dropping the helper back to stable would strip an API another module
 * relies on. Takes the highest of {what's resolved now, what this module wants}.
 */
export async function installChannelFor(
  helperId: string,
  requestedBy: ModuleChannel,
): Promise<ModuleChannel> {
  const state = await resolveHelperChannel(helperId);
  if (state.pinned) return state.channel; // an explicit pin wins over any single module
  return state.channel === "beta" || requestedBy === "beta" ? "beta" : "stable";
}
