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
