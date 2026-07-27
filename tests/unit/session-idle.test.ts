import { describe, it, expect } from "vitest";
import { getIdleTimeoutMs } from "@/lib/settings";

// BUG-52: the idle timeout shipped as 0, i.e. disabled, so an untouched session survived
// its whole absolute lifetime. A server restart used to be the one thing that reliably
// ended it, and 1.6.0 narrowed even that by deliberately keeping sessions across an
// in-place update. This guards the default staying on.
//
// Since 1.8.0 the idle window IS the single "Session length" setting, and 0 is no longer
// expressible — the control is a picker with a five-minute floor. So this now guards
// something slightly different: that the merge kept the default at two hours rather than
// inheriting the old seven-day absolute lifetime, which would have made every fresh install
// far more permissive than before.

describe("idle session timeout (BUG-52)", () => {
  it("is enabled out of the box, with nothing configured", async () => {
    const ms = await getIdleTimeoutMs();
    expect(ms).toBeGreaterThan(0);
  });

  it("defaults to two hours", async () => {
    expect(await getIdleTimeoutMs()).toBe(120 * 60 * 1000);
  });
});
