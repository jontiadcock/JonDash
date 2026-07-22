import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "@/lib/modules/types";
import { writeProvenance, removeProvenance } from "@/lib/modules/provenance";
import { DEFAULT_SOURCE_URL } from "@/lib/modules/sources";

/**
 * BUG-20. A module declaring a helper it doesn't have is silently inert — the build
 * succeeds and its declared work simply never runs. First-party modules now heal
 * themselves; third-party and imported ones must NOT, because fetching code on behalf of
 * a module the user got from somewhere else isn't a decision to make quietly.
 *
 * That distinction is the part worth testing: it decides whether JonDash reaches out to
 * the network on a module's behalf.
 */

const DATA_DIR = path.join(process.cwd(), ".data-test-reconcile");
let prevDataDir: string | undefined;

function def(id: string, helpers: string[]): ModuleDefinition {
  return {
    id,
    name: `Module ${id}`,
    description: "test",
    version: "1.0.0",
    minAppVersion: "1.5.0",
    permissions: [],
    helpers,
  };
}

async function enable(id: string) {
  await prisma.module.upsert({
    where: { id },
    update: { enabled: true },
    create: { id, name: `Module ${id}`, version: "1.0.0", enabled: true },
  });
}

async function cleanup() {
  await prisma.module.deleteMany();
  for (const id of ["official", "thirdparty", "sideloaded", "disabled"]) removeProvenance(id);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  prevDataDir ??= process.env.JONDASH_DATA_DIR;
  process.env.JONDASH_DATA_DIR = DATA_DIR;
  vi.resetModules();
  vi.restoreAllMocks();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (prevDataDir === undefined) delete process.env.JONDASH_DATA_DIR;
  else process.env.JONDASH_DATA_DIR = prevDataDir;
  await prisma.$disconnect();
});

/** Mock the registry + the fetcher, and report whether a fetch was attempted. */
async function runReconcile(defs: ModuleDefinition[]) {
  const registry = await import("@/lib/modules/registry");
  vi.spyOn(registry, "getAllModules").mockReturnValue(defs);

  const install = await import("@/lib/helpers/install");
  vi.spyOn(install, "helperFilesExist").mockReturnValue(false); // helper is missing
  const ensure = vi
    .spyOn(install, "ensureHelpersFor")
    .mockResolvedValue({ installed: [{ id: "scheduler", version: "1.0.0" } as never], missing: [] });

  const { reconcileHelpers } = await import("@/lib/helpers/reconcile");
  const gaps = await reconcileHelpers();
  return { gaps, fetched: ensure.mock.calls.length > 0 };
}

describe("helper reconciliation", () => {
  it("heals a module from the OFFICIAL source, and says a restart is needed", async () => {
    await enable("official");
    writeProvenance("official", { source: DEFAULT_SOURCE_URL, channel: "beta", version: "1.0.0" });

    const { gaps, fetched } = await runReconcile([def("official", ["scheduler"])]);

    expect(fetched).toBe(true);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].firstParty).toBe(true);
    expect(gaps[0].healed).toEqual(["scheduler"]);
    expect(gaps[0].missing).toEqual([]); // downloaded; awaiting the rebuild
  });

  it("does NOT fetch for a THIRD-PARTY module — reports it instead", async () => {
    await enable("thirdparty");
    writeProvenance("thirdparty", { source: "https://github.com/someone/their-addons", channel: "stable", version: "1.0.0" });

    const { gaps, fetched } = await runReconcile([def("thirdparty", ["scheduler"])]);

    expect(fetched).toBe(false); // the point: no network call on its behalf
    expect(gaps[0].firstParty).toBe(false);
    expect(gaps[0].healed).toEqual([]);
    expect(gaps[0].missing).toEqual(["scheduler"]);
    expect(gaps[0].reason).toMatch(/reinstall/i);
  });

  it("does NOT fetch for an IMPORTED module — reports it instead", async () => {
    await enable("sideloaded");
    writeProvenance("sideloaded", { source: "imported", channel: "stable", version: "1.0.0" });

    const { gaps, fetched } = await runReconcile([def("sideloaded", ["scheduler"])]);

    expect(fetched).toBe(false);
    expect(gaps[0].firstParty).toBe(false);
    expect(gaps[0].reason).toMatch(/imported/i);
  });

  it("does NOT fetch for a module with no provenance at all", async () => {
    await enable("official"); // enabled, but nothing recorded about where it came from
    const { gaps, fetched } = await runReconcile([def("official", ["scheduler"])]);
    expect(fetched).toBe(false);
    expect(gaps[0].firstParty).toBe(false);
  });

  it("ignores a disabled module — it isn't doing anything to be broken", async () => {
    writeProvenance("disabled", { source: DEFAULT_SOURCE_URL, channel: "stable", version: "1.0.0" });
    const { gaps, fetched } = await runReconcile([def("disabled", ["scheduler"])]);
    expect(gaps).toEqual([]);
    expect(fetched).toBe(false);
  });

  it("reports rather than throws when the source can't be reached", async () => {
    await enable("official");
    writeProvenance("official", { source: DEFAULT_SOURCE_URL, channel: "stable", version: "1.0.0" });

    const registry = await import("@/lib/modules/registry");
    vi.spyOn(registry, "getAllModules").mockReturnValue([def("official", ["scheduler"])]);
    const install = await import("@/lib/helpers/install");
    vi.spyOn(install, "helperFilesExist").mockReturnValue(false);
    vi.spyOn(install, "ensureHelpersFor").mockRejectedValue(new Error("offline"));

    const { reconcileHelpers } = await import("@/lib/helpers/reconcile");
    const gaps = await reconcileHelpers();

    expect(gaps[0].missing).toEqual(["scheduler"]);
    expect(gaps[0].reason).toBe("offline");
  });
});
