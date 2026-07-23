import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resolveHelperChannel, installChannelFor } from "@/lib/helpers/channel";

/**
 * Which channel a shared helper is on (MOD-10).
 *
 * THE BUG THIS REPLACES: the channel was whatever the last module event happened to pass.
 * A stable module pulled `scheduler@0.0.2`, then a beta module pulled `0.0.2-beta.1`, then
 * back again — the version flip-flopping with nothing recording why, and no way to see it.
 *
 * The rule now: a helper follows the HIGHEST channel among its dependents. That is only
 * safe because a helper never breaks its own API, so a newer version always satisfies an
 * older consumer — and it is the only choice that can't leave a module short of an API it
 * needs. An explicit admin pin overrides it.
 */

const HELPER = "chtest";

async function mockDependents(mods: { id: string; helpers?: unknown[] }[]) {
  const registry = await import("@/lib/modules/registry");
  vi.spyOn(registry, "getAllModules").mockReturnValue(
    mods.map((m) => ({
      id: m.id,
      name: m.id,
      description: "",
      version: "1.0.0",
      minAppVersion: "1.5.2",
      permissions: [],
      helpers: (m.helpers ?? [HELPER]) as never,
    })) as never,
  );
}

async function seedModule(id: string, channel: string) {
  await prisma.module.create({
    data: { id, name: id, version: "1.0.0", enabled: true, source: "test", channel },
  });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await prisma.module.deleteMany();
  await prisma.helper.deleteMany();
  await prisma.helper.create({ data: { id: HELPER, name: "Ch test", version: "1.0.0" } });
});

afterAll(async () => {
  await prisma.module.deleteMany();
  await prisma.helper.deleteMany();
  await prisma.$disconnect();
});

describe("a helper follows its dependents", () => {
  it("is stable when every dependent is stable", async () => {
    await mockDependents([{ id: "a" }, { id: "b" }]);
    await seedModule("a", "stable");
    await seedModule("b", "stable");

    const state = await resolveHelperChannel(HELPER);
    expect(state.channel).toBe("stable");
    expect(state.pinned).toBe(false);
    expect(state.betaDependents).toEqual([]);
  });

  it("goes to beta when ANY dependent is on beta, and says which", async () => {
    await mockDependents([{ id: "a" }, { id: "b" }]);
    await seedModule("a", "stable");
    await seedModule("b", "beta");

    const state = await resolveHelperChannel(HELPER);
    expect(state.channel).toBe("beta");
    expect(state.betaDependents).toEqual(["b"]); // drives the "why" shown to the admin
  });

  it("NO LONGER flip-flops with whichever module was touched last", async () => {
    // The regression in one assertion: with a stable dependent and a beta dependent, the
    // answer is the same whichever module triggers the resolve. Previously the caller's
    // own channel won, so the helper's version depended on install order.
    await mockDependents([{ id: "stablemod" }, { id: "betamod" }]);
    await seedModule("stablemod", "stable");
    await seedModule("betamod", "beta");

    expect(await installChannelFor(HELPER, "stable")).toBe("beta");
    expect(await installChannelFor(HELPER, "beta")).toBe("beta");
  });

  it("ignores a dependent that isn't enabled yet", async () => {
    // No Module row means the admin hasn't enabled it, so it has no chosen channel. It
    // must contribute nothing rather than being counted as stable and dragging the
    // helper back off beta.
    await mockDependents([{ id: "enabled" }, { id: "notyet" }]);
    await seedModule("enabled", "beta");

    const state = await resolveHelperChannel(HELPER);
    expect(state.channel).toBe("beta");
    expect(state.betaDependents).toEqual(["enabled"]);
  });

  it("reads the object form of a declared helper, not just the bare id", async () => {
    await mockDependents([{ id: "a", helpers: [{ id: HELPER, minVersion: "1.0.0" }] }]);
    await seedModule("a", "beta");

    const state = await resolveHelperChannel(HELPER);
    // `.includes()` on the union compiles but never matches an object — this would come
    // back stable, with the dependent invisible.
    expect(state.channel).toBe("beta");
    expect(state.betaDependents).toEqual(["a"]);
  });
});

describe("an admin pin overrides the derived channel", () => {
  it("wins over what the dependents say, in both directions", async () => {
    await mockDependents([{ id: "a" }]);
    await seedModule("a", "beta"); // derived would be beta

    await prisma.helper.update({ where: { id: HELPER }, data: { channelPin: "stable" } });
    const pinned = await resolveHelperChannel(HELPER);
    expect(pinned.channel).toBe("stable");
    expect(pinned.pinned).toBe(true);
    expect(pinned.derived).toBe("beta"); // so the UI can offer "follow its modules again"

    // A pin also stops a single module dragging it back.
    expect(await installChannelFor(HELPER, "beta")).toBe("stable");
  });

  it("returns to the DERIVED value when cleared, not the last installed one", async () => {
    await mockDependents([{ id: "a" }]);
    await seedModule("a", "beta");
    await prisma.helper.update({ where: { id: HELPER }, data: { channelPin: "stable" } });
    expect((await resolveHelperChannel(HELPER)).channel).toBe("stable");

    await prisma.helper.update({ where: { id: HELPER }, data: { channelPin: null } });
    const cleared = await resolveHelperChannel(HELPER);
    expect(cleared.channel).toBe("beta");
    expect(cleared.pinned).toBe(false);
  });

  it("ignores a pin that isn't a real channel", async () => {
    await mockDependents([{ id: "a" }]);
    await seedModule("a", "stable");
    await prisma.helper.update({ where: { id: HELPER }, data: { channelPin: "nonsense" } });

    const state = await resolveHelperChannel(HELPER);
    expect(state.channel).toBe("stable");
    expect(state.pinned).toBe(false); // treated as no pin, not as an unknown channel
  });
});
