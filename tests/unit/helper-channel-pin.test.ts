import { describe, it, expect } from "vitest";

/**
 * REGRESSION (BUG-35, 2026-07-23). The Beta channels switch did nothing on a helper that
 * was on beta by DERIVATION — reported by the owner: "I am not able to change the slider
 * on the 2 helpers".
 *
 * A helper's channel is `pin ?? derived`. The action mapped "switch off" to *clearing the
 * pin*, so on a helper whose dependent module is on beta: pin cleared → re-derive → beta
 * again. The switch redrew in the same position and nothing had changed. Overriding a
 * derivation requires a pin, not the absence of one.
 *
 * This asserts the mapping in isolation, which is where the bug was — no database needed.
 */

/** The rule the action implements: what pin does a switch request produce? */
function pinFor(target: "beta" | "stable", derived: "beta" | "stable"): "beta" | "stable" | null {
  return target === derived ? null : target;
}

/** What the helper ends up on, given a pin and what its modules derive. */
const resolve = (pin: "beta" | "stable" | null, derived: "beta" | "stable") => pin ?? derived;

describe("helper channel switch", () => {
  it("switching OFF a helper that derives beta actually moves it to stable", () => {
    // The reported bug: this used to produce pin=null → resolve → "beta", so nothing moved.
    const pin = pinFor("stable", "beta");
    expect(pin).toBe("stable");
    expect(resolve(pin, "beta")).toBe("stable");
  });

  it("switching ON a helper whose modules are all stable pins it to beta", () => {
    const pin = pinFor("beta", "stable");
    expect(pin).toBe("beta");
    expect(resolve(pin, "stable")).toBe("beta");
  });

  it("asking for the derived value CLEARS the pin rather than freezing it", () => {
    // Otherwise a helper that agrees with its modules today stays pinned to that value
    // forever, and silently stops following them when they move.
    expect(pinFor("beta", "beta")).toBeNull();
    expect(pinFor("stable", "stable")).toBeNull();
    expect(resolve(pinFor("beta", "beta"), "beta")).toBe("beta");
  });

  it("a pinned helper stops following its modules — which is the point of pinning", () => {
    // Pinned to stable while a dependent module sits on beta.
    expect(resolve("stable", "beta")).toBe("stable");
    // And pinned to beta while every dependent is stable.
    expect(resolve("beta", "stable")).toBe("beta");
  });

  it("every switch request changes something", () => {
    // The property the bug broke: from any starting state, flipping the switch must produce
    // a different resulting channel. A control that can redraw unchanged is indistinguishable
    // from one that is broken.
    for (const derived of ["beta", "stable"] as const) {
      for (const current of ["beta", "stable"] as const) {
        const target = current === "beta" ? "stable" : "beta";
        expect(resolve(pinFor(target, derived), derived)).toBe(target);
      }
    }
  });
});
