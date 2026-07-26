import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Admin-owned helper configuration is edited on a CORE page, behind a CORE permission check,
 * with no module in the path.
 *
 * **The bug this exists to fix** (add-ons session, 2026-07-26): `host-services` had nowhere to
 * put its allowlist editor, so it exposed `admin.add` on the surface a *module* could reach.
 * The module's consent screen said only "start, stop and restart the services you listed" —
 * nothing about ADDING to that list — and `admin.add` took the service name from the module's
 * own form. So a module could display "Add Plex" and submit "sshd". The UAC prompt names
 * `jondash-grant.exe` and never the service, so nothing on screen caught the substitution.
 *
 * **The thing being bounded could edit its own boundary.** These tests hold the structural fix
 * in place, because every part of it is the kind that looks redundant until it isn't.
 */
const ROOT = process.cwd();
const ACTION = fs.readFileSync(path.join(ROOT, "app", "admin", "helpers", "actions.ts"), "utf8");
// The panel moved into Admin → Addons as its "Shared capabilities" section (CORE-10);
// /admin/helpers is now a redirect, so the assertions follow the panel, not the old route.
const PAGE = fs.readFileSync(
  path.join(ROOT, "app", "admin", "modules", "shared-capabilities.tsx"),
  "utf8",
);
const TYPES = fs.readFileSync(path.join(ROOT, "lib", "helpers", "types.ts"), "utf8");

describe("the save channel is gated before the helper is reached", () => {
  it("checks same-origin and the admin permission", () => {
    expect(ACTION).toContain("assertSameOrigin()");
    expect(ACTION).toContain('requirePermission("modules.manage")');
  });

  it("gates BEFORE dispatching to the helper, not after", () => {
    // Order is the control. A check that runs after the helper has acted is not a check.
    const gate = ACTION.indexOf('requirePermission("modules.manage")');
    const dispatch = ACTION.indexOf("onSettingsSubmit(");
    expect(gate).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(gate);
  });

  it("builds ctx.user from the resolved session, never from the payload", () => {
    // The old context was module-supplied and forgeable exactly as ctx.can was. This one is
    // core's, which is the entire difference.
    expect(ACTION).toMatch(/user:\s*\{\s*id:\s*admin\.id/);
    // The payload must never be the source of identity.
    expect(ACTION).not.toMatch(/user:\s*payload/);
  });

  it("refuses a helper that declares no handler, rather than silently doing nothing", () => {
    expect(ACTION).toContain("if (!def.onSettingsSubmit)");
  });

  it("audits the outcome either way", () => {
    // A refused attempt to change what a helper may do is as worth recording as an accepted one.
    expect(ACTION).toContain("admin.helper.settings");
    expect(ACTION).toMatch(/result\.ok \? "applied" : /);
  });

  it("survives a helper that throws", () => {
    // Otherwise a broken helper presents as a blank screen with no explanation.
    expect(ACTION).toMatch(/catch\s*\(e\)/);
    expect(ACTION).toContain("admin.helper.settings.error");
  });
});

describe("the page that renders a panel", () => {
  it("is behind the admin permission", () => {
    expect(PAGE).toContain('requirePermission("modules.manage")');
  });

  it("passes the session-resolved admin into the panel context", () => {
    expect(PAGE).toMatch(/ctx=\{\{\s*helperId:\s*def\.id,\s*user:\s*admin\s*\}\}/);
  });
});

describe("the contract says the gated path is the only path", () => {
  it("documents that a helper may not define its own server action for settings", () => {
    // The lesson was not "helpers should remember to check" — it is that a check which must be
    // remembered will eventually be forgotten. If this wording goes, the reason goes with it.
    expect(TYPES).toMatch(/may not define its own server action/i);
  });

  it("keeps HelperSettingsContext carrying a user", () => {
    expect(TYPES).toContain("HelperSettingsContext");
    expect(TYPES).toMatch(/user:\s*\{\s*id:\s*string;\s*email:\s*string;\s*role:/);
  });
});
