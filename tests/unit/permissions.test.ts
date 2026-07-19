import { describe, it, expect } from "vitest";
import {
  sanitizePermissions,
  parsePermissionsJson,
  allowedSections,
  firstPermittedAdminPath,
  ALL_PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";

describe("permission input hardening", () => {
  it("keeps only valid, de-duplicated capability keys", () => {
    const out = sanitizePermissions([
      "users.manage",
      "users.manage",
      "not.a.real.cap",
      "settings.manage",
      42,
      null,
    ]);
    expect(out).toEqual(["users.manage", "settings.manage"]);
  });

  it("parses a stored permissions JSON string, ignoring junk", () => {
    expect(parsePermissionsJson('["audit.view","bogus"]')).toEqual(["audit.view"]);
    expect(parsePermissionsJson("not json")).toEqual([]);
    expect(parsePermissionsJson('{"a":1}')).toEqual([]);
  });
});

describe("admin section visibility", () => {
  it("shows only sections a capability set unlocks", () => {
    const perms = new Set<Permission>(["audit.view", "settings.manage"]);
    const labels = allowedSections(perms).map((s) => s.label);
    expect(labels).toEqual(["Audit", "Settings"]);
  });

  it("maps either users capability to the Users section", () => {
    expect(allowedSections(new Set<Permission>(["users.reset"])).map((s) => s.href)).toEqual([
      "/admin",
    ]);
  });

  it("first permitted path is the first visible section, else /dashboard", () => {
    expect(firstPermittedAdminPath(new Set<Permission>(["sessions.manage"]))).toBe(
      "/admin/sessions",
    );
    expect(firstPermittedAdminPath(new Set<Permission>())).toBe("/dashboard");
  });

  it("a full set (every capability) exposes every section", () => {
    const all = new Set<Permission>(ALL_PERMISSIONS);
    expect(allowedSections(all).length).toBeGreaterThanOrEqual(6);
  });
});
