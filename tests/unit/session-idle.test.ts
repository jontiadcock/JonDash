import { describe, it, expect } from "vitest";
import { getIdleTimeoutMs } from "@/lib/settings";

// BUG-52: the idle timeout shipped as 0, i.e. disabled, so an untouched session
// survived its full 7-day absolute lifetime. A server restart used to be the one
// thing that reliably ended it, and 1.6.0 narrowed even that by deliberately
// keeping sessions across an in-place update. This guards the default staying on:
// a future edit back to 0 would silently restore the old behaviour.

describe("idle session timeout (BUG-52)", () => {
  it("is enabled out of the box, with nothing configured", async () => {
    const ms = await getIdleTimeoutMs();
    expect(ms).toBeGreaterThan(0);
  });

  it("defaults to two hours", async () => {
    expect(await getIdleTimeoutMs()).toBe(120 * 60 * 1000);
  });
});
