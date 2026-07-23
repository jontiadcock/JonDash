import { describe, it, expect } from "vitest";
import { parseVersion, compareVersions, isNewer, diffType } from "@/lib/version";

describe("version helpers", () => {
  it("parses x.y.z and tolerates a leading v", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, pre: null });
    expect(parseVersion("v10.0.4")).toMatchObject({ major: 10, minor: 0, patch: 4, pre: null });
    expect(parseVersion("nope")).toBeNull();
  });

  it("parses a beta pre-release", () => {
    expect(parseVersion("1.3.0-beta.2")).toEqual({ major: 1, minor: 3, patch: 0, pre: 2 });
    expect(parseVersion("v1.3.0-beta.1")).toMatchObject({ pre: 1 });
  });

  it("compares versions numerically (not lexically)", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("orders pre-releases below the matching release and among themselves", () => {
    expect(compareVersions("1.3.0-beta.1", "1.3.0-beta.2")).toBe(-1);
    expect(compareVersions("1.3.0-beta.2", "1.3.0")).toBe(-1); // beta < release
    expect(compareVersions("1.3.0", "1.3.0-beta.2")).toBe(1);
    expect(isNewer("1.3.0-beta.2", "1.3.0-beta.1")).toBe(true); // iterative beta
    expect(isNewer("1.3.0", "1.3.0-beta.9")).toBe(true); // promotion to stable
    expect(isNewer("1.3.0-beta.1", "1.2.5")).toBe(true); // beta ahead of stable
    expect(isNewer("1.2.5", "1.3.0-beta.1")).toBe(false); // no downgrade
  });

  it("isNewer only when strictly greater", () => {
    expect(isNewer("1.1.1", "1.1.0")).toBe(true);
    expect(isNewer("1.1.0", "1.1.0")).toBe(false);
    expect(isNewer("1.0.9", "1.1.0")).toBe(false);
  });

  it("classifies the bump level, ignoring the beta suffix", () => {
    expect(diffType("1.0.3", "2.0.0")).toBe("major");
    expect(diffType("1.0.3", "1.1.0")).toBe("minor");
    expect(diffType("1.2.5", "1.3.0-beta.1")).toBe("minor");
    expect(diffType("1.0.3", "1.0.4")).toBe("patch");
    expect(diffType("1.0.3", "1.0.3")).toBeNull();
  });
});

/**
 * BUG-31 (2026-07-23, reported by the owner from a real install). The Updates page offered
 * "Health monitoring v0.0.5 → v0.0.5-beta.1" with a tick-box: a DOWNGRADE presented as an
 * update.
 *
 * The trigger is a release-process one, not a user mistake. Promoting a pre-release to
 * stable leaves the beta channel still pointing at the pre-release, and semver sorts a
 * pre-release BELOW its release — so every install on beta gets invited to go backwards
 * the moment a beta is promoted.
 *
 * `updateAvailable` is now `cmp > 0`, not `cmp !== 0`. These assert the ordering that rule
 * depends on.
 */
describe("a pre-release is never newer than its release (BUG-31)", () => {
  it("0.0.5-beta.1 sorts BELOW 0.0.5", () => {
    expect(compareVersions("0.0.5-beta.1", "0.0.5")).toBeLessThan(0);
    expect(compareVersions("0.0.5", "0.0.5-beta.1")).toBeGreaterThan(0);
  });

  it("so it is not an available update from 0.0.5", () => {
    // The exact comparison the Updates page makes.
    expect(compareVersions("0.0.5-beta.1", "0.0.5") > 0).toBe(false);
  });

  it("but a genuinely newer pre-release still is", () => {
    // The fix must not stop beta doing its job: 0.0.6-beta.1 IS ahead of 0.0.5.
    expect(compareVersions("0.0.6-beta.1", "0.0.5")).toBeGreaterThan(0);
    expect(compareVersions("0.0.5-beta.2", "0.0.5-beta.1")).toBeGreaterThan(0);
  });

  it("and equal versions are not an update either", () => {
    expect(compareVersions("1.5.3-beta.8", "1.5.3-beta.8")).toBe(0);
  });
});
