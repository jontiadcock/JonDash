import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * REGRESSION (BUG-37, 2026-07-23). "I am not able to slide the beta sliders for the helpers."
 *
 * The write was landing every time — the owner's audit log showed five successful writes from
 * five frustrated clicks — but `getHelperUpdateStatus()` caches for three minutes and the panel
 * reads the helper's channel from that cache. The row redrew in its old position, survived a
 * full page reload (the cache is in-process, not per-request), and the switch looked dead.
 *
 * The real lesson is that it wasn't one action. The update system has THREE 3-minute caches,
 * and a write that changes what any of them answer has to invalidate it. Two more instances
 * were sitting there unreported: switching JonDash's own channel didn't clear the app cache,
 * and switching a module's channel didn't clear the module cache.
 *
 * This is a source test on purpose. The failure is "an action forgot a call", which no
 * behavioural test of a single action would catch — the next action added is the one at risk.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** The body of a named exported function, so assertions can't match a neighbour's code. */
function bodyOf(src: string, fn: string): string {
  const start = src.indexOf(`export async function ${fn}`);
  if (start < 0) throw new Error(`${fn} not found — renamed? Update this test rather than deleting it.`);
  const rest = src.slice(start);
  const open = rest.indexOf("{");
  let depth = 0;
  for (let i = open; i < rest.length; i++) {
    if (rest[i] === "{") depth++;
    else if (rest[i] === "}" && --depth === 0) return rest.slice(open, i + 1);
  }
  throw new Error(`could not find the end of ${fn}`);
}

describe("a write that changes a cached answer must invalidate that cache", () => {
  const scheduleActions = () => read("app/admin/updates/schedule-actions.ts");
  const moduleActions = () => read("app/admin/modules/actions.ts");

  it("changing a HELPER's channel clears the helper status cache", () => {
    // The reported bug. Without this the switch writes and the page shows the old value.
    expect(bodyOf(scheduleActions(), "setHelperChannelPinAction")).toContain("invalidateHelperUpdateCache");
  });

  it("changing the APP's channel clears the app update cache", () => {
    // Unreported: the cached status came from the other channel's manifest.
    expect(bodyOf(scheduleActions(), "setAppChannelAction")).toContain("clearUpdateStatusCache");
  });

  it("changing a MODULE's channel clears BOTH the module and helper caches", () => {
    // Unreported: a module's channel decides which manifest entry applies to it, AND
    // re-derives the channel of every helper that module needs.
    const body = bodyOf(moduleActions(), "setModuleChannelAction");
    expect(body).toContain("clearModuleUpdateCache");
    expect(body).toContain("invalidateHelperUpdateCache");
  });

  it("every cache still exposes a way to clear it", () => {
    // If one of these disappears the callers above fail to compile, but a cache added
    // WITHOUT an invalidator is the shape of the original bug and compiles fine.
    expect(read("lib/helpers/updates.ts")).toContain("export function invalidateHelperUpdateCache");
    expect(read("lib/modules/updates.ts")).toContain("export function clearModuleUpdateCache");
    expect(read("lib/update.ts")).toContain("export function clearUpdateStatusCache");
  });
});
