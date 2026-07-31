import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getEffectivePermissionsUncached, ALL_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * BUG-57 — an admin role assigned to an ADMIN did nothing, while the tick-boxes saved,
 * persisted and redrew as ticked. Someone could reasonably conclude they had scoped an
 * admin's powers by unticking things. They had not.
 *
 * Two halves, tested differently on purpose:
 *
 *  1. The BEHAVIOUR that makes roles meaningless on an admin — assertable directly.
 *  2. The GUARD in the server action — source-level, because the failure mode is "the action
 *     forgot to refuse", which no behavioural test of that action can catch (the same reasoning
 *     as the BUG-37 regression test). Hiding the form is not enough: a page that states a rule
 *     while the action still accepts the write is telling the truth by luck.
 * REFS app/admin/actions.ts · app/admin/users/[id]/page.tsx — read as text
 */
const ACTIONS = fs.readFileSync(path.join(process.cwd(), "app", "admin", "actions.ts"), "utf8");
const USER_PAGE = fs.readFileSync(
  path.join(process.cwd(), "app", "admin", "users", "[id]", "page.tsx"),
  "utf8",
);

describe("why admin roles cannot apply to an admin", () => {
  it("gives an ADMIN every capability regardless of assigned roles", async () => {
    // No DB read happens for an ADMIN — it short-circuits on the first line, which is exactly
    // why any role assigned to one is ignored.
    const perms = await getEffectivePermissionsUncached({ id: "nobody", role: "ADMIN" });
    expect(perms.size).toBe(ALL_PERMISSIONS.length);
    for (const p of ALL_PERMISSIONS) expect(perms.has(p)).toBe(true);
  });
});

describe("the guard is in the action, not only in the UI", () => {
  const action = ACTIONS.match(/export async function setUserAccessRolesAction[\s\S]*?\n}/)?.[0] ?? "";

  it("finds the action", () => {
    expect(action, "setUserAccessRolesAction not found").toContain("accessRoleIds");
  });

  it("refuses an ADMIN and a service account before writing", () => {
    const guard = action.indexOf('user.role === "ADMIN"');
    const write = action.indexOf("prisma.user.update");
    expect(guard, "no ADMIN guard in setUserAccessRolesAction").toBeGreaterThan(-1);
    expect(action, "no service-account guard").toContain("isServiceAccount(user)");
    expect(guard, "the guard must come before the write").toBeLessThan(write);
  });

  it("does NOT clear the stored rows when it refuses", () => {
    // Owner decision 2026-07-27: demoting an admin back to a normal user restores whatever was
    // assigned. Clearing on save would silently discard it, which is the opposite of the fix.
    const refusal = action.slice(action.indexOf('user.role === "ADMIN"'), action.indexOf("accessRoleIds ="));
    expect(refusal).not.toMatch(/set:\s*\[\]/);
    expect(refusal).not.toMatch(/deleteMany/);
  });
});

describe("the user page explains rather than offering a dead control", () => {
  it("replaces the tick-boxes for an admin or a service account", () => {
    expect(USER_PAGE).toMatch(/user\.role === "ADMIN" \|\| isService \?/);
  });

  it("says the roles are still recorded, so demotion is not a surprise", () => {
    expect(USER_PAGE).toMatch(/still recorded/);
  });

  it("uses the new name in the heading and the link", () => {
    expect(USER_PAGE).toContain("Admin Roles");
    expect(USER_PAGE, "old name still present").not.toMatch(/>\s*Access Roles\s*</);
  });
});
