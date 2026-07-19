import { describe, it, expect } from "vitest";
import { parseVersion, compareVersions, isNewer, diffType } from "@/lib/version";

describe("version helpers", () => {
  it("parses and tolerates a leading v", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v10.0.4")).toEqual([10, 0, 4]);
    expect(parseVersion("nope")).toBeNull();
  });

  it("compares versions numerically (not lexically)", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("isNewer only when strictly greater", () => {
    expect(isNewer("1.1.1", "1.1.0")).toBe(true);
    expect(isNewer("1.1.0", "1.1.0")).toBe(false);
    expect(isNewer("1.0.9", "1.1.0")).toBe(false);
  });

  it("classifies the semver bump level", () => {
    expect(diffType("1.0.3", "2.0.0")).toBe("major");
    expect(diffType("1.0.3", "1.1.0")).toBe("minor");
    expect(diffType("1.0.3", "1.0.4")).toBe("patch");
    expect(diffType("1.0.3", "1.0.3")).toBeNull();
  });
});
