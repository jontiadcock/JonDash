import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { nextGrants } from "@/lib/modules/permissions";
import type { ModuleDefinition, DeclaredPermission } from "@/lib/modules/types";

/**
 * CORE-10. Grants are per (module, capability), and the declared set is the ceiling.
 *
 * A helper-level switch would silently widen every module that declared that helper — including
 * ones installed earlier for unrelated reasons. And a grant must never exceed what the module's
 * consent screen showed, or the screen was a lie.
 * REFS lib/permissions-view.ts · app/admin/permissions/ui.tsx · app/admin/permissions/actions.ts
 *      lib/helpers/types.ts — read as text
 */
const def = (permissions: string[]) =>
  ({ id: "m", name: "M", permissions } as unknown as ModuleDefinition);
const P = (s: string) => s as unknown as DeclaredPermission;

describe("nextGrants", () => {
  it("revokes one capability without touching the others", () => {
    const out = nextGrants(def(["a:read", "a:write"]), [P("a:read"), P("a:write")], P("a:write"), false);
    expect(out).toEqual([P("a:read")]);
  });

  it("re-grants something previously revoked", () => {
    expect(nextGrants(def(["a:read"]), [], P("a:read"), true)).toEqual([P("a:read")]);
  });

  it("REFUSES a permission the module never declared", () => {
    // The declared set is the ceiling. Otherwise a tampered form could widen a module past
    // what its consent screen showed, which would make the screen worthless.
    expect(nextGrants(def(["a:read"]), [P("a:read")], P("host-services:control"), true)).toBeNull();
  });

  it("drops stored permissions the module no longer declares", () => {
    // An update can remove a capability. A grant left behind for something no longer declared
    // is a permission nobody can see on any screen.
    const out = nextGrants(def(["a:read"]), [P("a:read"), P("a:gone")], P("a:read"), true);
    expect(out).toEqual([P("a:read")]);
  });

  it("is idempotent", () => {
    const once = nextGrants(def(["a:read"]), [P("a:read")], P("a:read"), true);
    expect(once).toEqual([P("a:read")]);
  });
});

describe("the structural rules the page depends on", () => {
  const VIEW = fs.readFileSync(path.join(process.cwd(), "lib", "permissions-view.ts"), "utf8");
  const UI = fs.readFileSync(path.join(process.cwd(), "app", "admin", "permissions", "ui.tsx"), "utf8");
  const ACT = fs.readFileSync(path.join(process.cwd(), "app", "admin", "permissions", "actions.ts"), "utf8");

  it("builds both axes from ONE source, so they cannot disagree", () => {
    // Two separate queries would eventually answer the same question differently, and a
    // permissions screen that contradicts itself is worse than one view.
    expect(VIEW).toMatch(/capabilityHolders[\s\S]*?await modulePermissions\(\)/);
  });

  it("takes risk from core's existing judgement, not a second opinion", () => {
    /*
     * The first attempt used its own rule, and every core permission came out "High risk" —
     * which made the genuinely dangerous capability indistinguishable from crypto:use and
     * defeated the point of showing risk at all. Caught by looking at the page with data in it.
     * describePermission is documented as THE single place consent text is decided; a second
     * source of that judgement drifted on day one.
     */
    expect(VIEW).toContain("describePermission(permission)");
    expect(VIEW).toMatch(/risk:\s*cap\?\.risk\s*\?\?\s*\(described\.dangerous \? "high" : "low"\)/);
  });

  it("shows the raw permission key, never only a friendly label", () => {
    // A label is for reading; the key is what is enforced. Same lesson as the module that
    // displayed "Add Plex" and submitted "sshd".
    expect(UI).toContain("cap.permission");
    expect(UI).toContain("it.value");
  });

  it("keeps the bounding set on the same card as the switch", () => {
    // A bound the admin has to go and find is the bug this page exists to prevent.
    const card = UI.slice(UI.indexOf("function CapabilityCard"), UI.indexOf("function ModuleCard"));
    expect(card).toContain("GrantToggle");
    expect(card).toContain("ScopeEditor");
  });

  it("only moves the switch once the server agrees", () => {
    // Optimistic UI here would show a capability as revoked while it was still held.
    expect(UI).toMatch(/if \(res\.ok\) setOn\(want\)/);
  });

  it("gates every mutating action and audits the real value", () => {
    expect(ACT).toContain('requirePermission("modules.manage")');
    expect(ACT).toContain("assertSameOrigin()");
    // The audit records the VALUE acted on, not a label that could misrepresent it.
    expect(ACT).toMatch(/detail:.*\$\{op\} "\$\{value\}"/);
  });

  it("routes EVERY exported action through the gate, including ones added later", () => {
    /*
     * The point of the gate is that it can't be forgotten. A new action added next to five
     * gated ones looks right while being reachable by anyone who can reach the route, so the
     * check is enumerated rather than eyeballed. setItemToggleAction was added after the
     * original five.
     */
    const exported = [...ACT.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    expect(exported.length).toBeGreaterThan(5);
    for (const name of exported) {
      const start = ACT.indexOf(`export async function ${name}`);
      const rest = ACT.slice(start + 1);
      const nextExport = rest.indexOf("\nexport ");
      const body = nextExport === -1 ? rest : rest.slice(0, nextExport);
      expect(body, `${name} must call gate()`).toMatch(/await gate\(\)/);
    }
  });
});

describe("the per-item switch (itemToggle)", () => {
  const UI = fs.readFileSync(path.join(process.cwd(), "app", "admin", "permissions", "ui.tsx"), "utf8");
  const ACT = fs.readFileSync(path.join(process.cwd(), "app", "admin", "permissions", "actions.ts"), "utf8");
  const TYPES = fs.readFileSync(path.join(process.cwd(), "lib", "helpers", "types.ts"), "utf8");

  it("reads its state from the list, not from a second call that could disagree", () => {
    // Two sources for "is this one unattended?" is the bug, not the round trip — on a screen
    // whose whole job is showing what something may do.
    expect(TYPES).toMatch(/toggleOn\?: boolean/);
    expect(UI).toContain("item.toggleOn === true");
    expect(ACT).not.toMatch(/itemToggle\.isOn/);
  });

  it("never sends the helper's function across to the client", () => {
    // Only the declaration crosses; `set` is reachable solely through the gated action.
    expect(ACT).toMatch(/label:\s*t\.label,\s*warning:\s*t\.warning/);
  });

  it("asks before switching ON and applies OFF immediately", () => {
    // Same asymmetry as `unbounded`: these are the only two controls that remove a prompt the
    // admin would otherwise see. Confirming the safe direction just trains click-through.
    const block = UI.slice(UI.indexOf("function ItemToggle"), UI.indexOf("function Picker"));
    expect(block).toMatch(/e\.target\.checked \? setConfirming\(true\) : void apply\(false\)/);
  });

  it("audits the item and the direction", () => {
    expect(ACT).toContain("admin.helper.scope.toggle");
    expect(ACT).toMatch(/on \? "ON" : "OFF"/);
  });
});

describe("the dependent option under the unbounded switch", () => {
  const UI = fs.readFileSync(path.join(process.cwd(), "app", "admin", "permissions", "ui.tsx"), "utf8");
  const ACT = fs.readFileSync(path.join(process.cwd(), "app", "admin", "permissions", "actions.ts"), "utf8");

  const block = UI.slice(UI.indexOf("function Unbounded"));

  it("CONFIRMS THE OFF DIRECTION — the asymmetry is inverted here", () => {
    /*
     * This is the one control on the page where ON is the safe direction: the option protects,
     * so removing it is what widens the grant. Confirming the wrong way round would put the
     * friction on the safe move and none on the dangerous one, which is worse than no confirm
     * at all because it reads as though the dangerous move was checked.
     */
    expect(block).toMatch(/if \(e\.target\.checked\) void applyOption\(true\);\s*else setConfirmingOption\(true\);/);
    // And the unbounded switch itself must still confirm the ON direction — the two coexist.
    expect(block).toMatch(/if \(e\.target\.checked\) setConfirming\(true\);\s*else void apply\(false\)/);
  });

  it("renders only while the grant it qualifies is on", () => {
    // A protection shown under a switched-off grant implies it is protecting something.
    expect(block).toMatch(/state\.on && state\.option/);
  });

  it("re-reads state from the helper instead of trusting the click", () => {
    expect(block).toMatch(/const fresh = await unboundedStateAction/);
  });

  it("audits it separately, and says which direction removed the protection", () => {
    // "When did the protection come off" must not be buried in a row about the grant that
    // merely enabled it.
    expect(ACT).toContain("admin.helper.unbounded.option");
    expect(ACT).toContain("PROTECTION REMOVED");
  });

  it("never sends the helper's setter to the client", () => {
    const read = ACT.slice(ACT.indexOf("export async function unboundedStateAction"));
    expect(read).toMatch(/label:\s*o\.label,\s*warning:\s*o\.warning,\s*on:\s*await o\.isOn\(\)/);
  });
});
