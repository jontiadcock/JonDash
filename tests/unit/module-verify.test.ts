import { describe, it, expect } from "vitest";
import { verifyModuleFiles, parseDeclaredPermissions } from "@/lib/modules/verify";

// The verifier is what makes a module's permission list HONEST: it refuses code that
// reaches for a capability the admin was never asked to approve. It is pattern-based
// (not a sandbox), so these tests pin the rules that actually matter.

const MODULE_TS = (perms: string[], body = "") => ({
  path: "module.ts",
  bytes: 200,
  text: `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.4.0",
  permissions: [${perms.map((p) => `"${p}"`).join(", ")}],
};
export default mod;
${body}
`,
});

function verify(files: { path: string; text?: string; bytes: number }[], manifest?: string[]) {
  return verifyModuleFiles("demo", files, manifest as never);
}

describe("module verifier", () => {
  it("accepts a clean module", () => {
    const res = verify([MODULE_TS([]), { path: "MODULE.md", bytes: 10, text: "# Demo" }]);
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it("reads the permissions the module declares", () => {
    expect(parseDeclaredPermissions(MODULE_TS(["network:outbound", "audit:write"]).text)).toEqual([
      "network:outbound",
      "audit:write",
    ]);
  });

  it("refuses constructs no module has a legitimate need for", () => {
    const cases: [string, string][] = [
      ['import { execFile } from "node:child_process";', "banned-construct"],
      ["const f = eval(userInput);", "banned-construct"],
      ["const f = new Function('return 1');", "banned-construct"],
      ["const m = await import(somePath);", "banned-construct"],
      ['import fs from "node:fs";', "filesystem"],
      ['import fs from "fs";', "filesystem"],
      ["const k = process.env.SECRET;", "env-access"],
    ];
    for (const [body, rule] of cases) {
      const res = verify([MODULE_TS([], body)]);
      expect(res.ok, body).toBe(false);
      expect(res.issues.map((i) => i.rule), body).toContain(rule);
    }
  });

  it("allows only the two sanctioned core imports", () => {
    const ok = verify([MODULE_TS([], 'import { moduleAction } from "@/lib/modules/api";')]);
    expect(ok.ok).toBe(true);

    for (const bad of ["@/lib/db", "@/lib/crypto", "@/lib/email/send", "@/lib/modules/store", "@/lib/modules/registry"]) {
      const res = verify([MODULE_TS([], `import x from "${bad}";`)]);
      expect(res.ok, bad).toBe(false);
      expect(res.issues.map((i) => i.rule), bad).toContain("core-internals");
    }
  });

  it("refuses a capability the module didn't declare, and allows it once declared", () => {
    const undeclared = verify([MODULE_TS([], 'import net from "node:net";')]);
    expect(undeclared.ok).toBe(false);
    expect(undeclared.issues[0].rule).toBe("undeclared-capability");

    const declared = verify([MODULE_TS(["network:outbound"], 'import net from "node:net";')]);
    expect(declared.ok).toBe(true);

    // A bare global fetch() is the same capability as raw sockets.
    expect(verify([MODULE_TS([], "await fetch(url);")]).ok).toBe(false);
    expect(verify([MODULE_TS(["network:outbound"], "await fetch(url);")]).ok).toBe(true);
    // ...but ctx.fetch is already gated by the framework.
    expect(verify([MODULE_TS([], "await ctx.fetch(url);")]).ok).toBe(true);
  });

  it("refuses a source manifest that understates what the module asks for", () => {
    const res = verify([MODULE_TS(["network:outbound", "crypto:use"])], ["network:outbound"]);
    expect(res.ok).toBe(false);
    expect(res.issues.map((i) => i.rule)).toContain("permission-mismatch");
  });

  // REGRESSION: a module was refused because its UI said "Bulk import (JSON)". JSX text
  // is neither a comment nor a string literal, so the noise stripper never saw it —
  // ordinary English was read as a computed dynamic import.
  it("does not mistake English in JSX text for a computed import()", () => {
    const ui = `export default function P() {
      return (<div>
        <p>Paste a saved configuration into Bulk import (JSON) to restore it.</p>
        <p>You can import (or export) your settings at any time.</p>
      </div>);
    }`;
    expect(verify([MODULE_TS([]), { path: "page.tsx", bytes: 200, text: ui }]).ok).toBe(true);
  });

  it("still catches a real computed import() in every expression position", () => {
    for (const body of [
      "const m = await import(userPath);",
      "const m = import(userPath);",
      "return import(userPath);",
      "register(import(userPath));",
    ]) {
      const res = verify([MODULE_TS([], body)]);
      expect(res.ok, body).toBe(false);
      expect(res.issues.map((i) => i.rule), body).toContain("banned-construct");
    }
    // ...while a literal import stays fine.
    expect(verify([MODULE_TS([], 'const m = await import("./thing");')]).ok).toBe(true);
  });

  it("does not trip on rule words appearing in comments or prose", () => {
    const res = verify([
      MODULE_TS([], "// never use eval() or node:child_process here\n/* process.env is banned */"),
      { path: "MODULE.md", bytes: 60, text: "Do not use eval() or import node:fs in a module." },
    ]);
    expect(res.ok).toBe(true);
  });

  // MOD-08. The cross-module case is a REGRESSION: the check meant to allow "its own
  // files" allowed every `@/modules/…` path, so a module could reach into another's
  // internals — sidestepping that module's permission scoping and coupling the two
  // invisibly (uninstall one, the other's build breaks and auto-recovery removes it).
  it("allows a module its own files but not another module's", () => {
    const own = verify([MODULE_TS([], 'import { helper } from "@/modules/demo/lib/util";')]);
    expect(own.ok).toBe(true);

    const other = verify([MODULE_TS([], 'import { secret } from "@/modules/health-monitor/lib/store";')]);
    expect(other.ok).toBe(false);
    expect(other.issues.map((i) => i.rule)).toContain("core-internals");
  });

  it("allows a declared helper's public api, and nothing else about it", () => {
    const declared = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.5.0",
  permissions: [], helpers: ["filesystem"],
};
export default mod;
import { readFile } from "@/helpers/filesystem/api";`;
    expect(verify([{ path: "module.ts", bytes: 300, text: declared }]).ok).toBe(true);

    // Undeclared helper.
    const undeclared = verify([MODULE_TS([], 'import { readFile } from "@/helpers/filesystem/api";')]);
    expect(undeclared.ok).toBe(false);
    expect(undeclared.issues.map((i) => i.rule)).toContain("undeclared-helper");

    // Declared, but reaching past the narrow API into its internals.
    const internals = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.5.0",
  permissions: [], helpers: ["filesystem"],
};
export default mod;
import { raw } from "@/helpers/filesystem/lib/fs";`;
    const res = verify([{ path: "module.ts", bytes: 300, text: internals }]);
    expect(res.ok).toBe(false);
    expect(res.issues.map((i) => i.rule)).toContain("helper-internals");
  });

  /**
   * 1.5.1: which helper backs a permission is DERIVED from its namespace, not looked up in
   * a hardcoded map. `filesystem:write` needs the `filesystem` helper because the namespace
   * says so — which is what lets a new helper name its own capability without a core
   * release. The old map (`files:read`/`files:write` → `filesystem`) is gone.
   */
  it("refuses a helper-provided permission without the helper that provides it", () => {
    const noHelper = verify([MODULE_TS(["filesystem:write"])]);
    expect(noHelper.ok).toBe(false);
    expect(noHelper.issues.map((i) => i.rule)).toContain("missing-helper");

    const withHelper = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.5.0",
  permissions: ["filesystem:write"], helpers: ["filesystem"],
};
export default mod;`;
    expect(verify([{ path: "module.ts", bytes: 300, text: withHelper }]).ok).toBe(true);
  });

  it("derives the helper from the namespace — no core edit for a NEW helper's capability", () => {
    // A helper core has never heard of. Nothing in core lists `backup:restore`; the rule
    // still holds purely from the namespace. This is the whole point of the feature.
    const missing = verify([MODULE_TS(["backup:restore"])]);
    expect(missing.ok).toBe(false);
    expect(missing.issues.map((i) => i.rule)).toContain("missing-helper");
    expect(missing.issues.find((i) => i.rule === "missing-helper")?.detail).toContain("backup");

    const declared = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "demo", name: "Demo", description: "d", version: "1.0.0", minAppVersion: "1.5.1",
  permissions: ["backup:restore"], helpers: ["backup"],
};
export default mod;`;
    expect(verify([{ path: "module.ts", bytes: 300, text: declared }]).ok).toBe(true);
  });

  it("does not mistake a CORE permission for a helper-provided one", () => {
    // `crypto:use` is namespaced-looking but core implements it — it must never demand a
    // "crypto" helper. This is the regression that would break every existing module.
    for (const p of ["network:outbound", "crypto:use", "audit:write", "email:send"]) {
      const res = verify([MODULE_TS([p])]);
      expect(res.issues.map((i) => i.rule), p).not.toContain("missing-helper");
    }
  });

  /**
   * REGRESSION (BUG-27, 2026-07-23). Found by testing BYPASSES rather than re-reading the
   * rules — the existing tests all assert constructs that ARE caught, which is exactly why
   * these two survived. Both are ordinary code, not obfuscation.
   *
   * 1. The fetch rule's lookbehind excludes `.fetch(` so that `ctx.fetch(...)` — the
   *    sanctioned path — stays legal. That also let `globalThis.fetch(...)` through, which
   *    is the same capability by a longer name.
   * 2. A LITERAL `await import("node:fs")` fell between the banned-construct rule (which
   *    targets *computed* import()) and the filesystem rule (which only knew static
   *    syntax). Filesystem access is refused outright for modules — it is the ban the whole
   *    helper model rests on — so this was the more serious of the two.
   */
  it("catches reaching the network via a global, not just a bare fetch()", () => {
    for (const body of [
      `await globalThis.fetch(url);`,
      `await global.fetch(url);`,
      `await window.fetch(url);`,
      `const { fetch: f } = globalThis; await f(url);`,
    ]) {
      const res = verify([MODULE_TS([], body)]);
      expect(res.ok, body).toBe(false);
      expect(res.issues.map((i) => i.rule), body).toContain("undeclared-capability");
      // ...and declaring it makes them legal, exactly like a bare fetch().
      expect(verify([MODULE_TS(["network:outbound"], body)]).ok, body).toBe(true);
    }
    // The sanctioned path must stay allowed — the lookbehind exists for this.
    expect(verify([MODULE_TS([], "await ctx.fetch(url);")]).ok).toBe(true);
  });

  it("catches a banned module reached by a LITERAL dynamic import", () => {
    const cases: [string, string][] = [
      [`const fs = await import("node:fs");`, "filesystem"],
      [`const fs = await import("fs/promises");`, "filesystem"],
      [`const cp = await import("node:child_process");`, "banned-construct"],
      [`const net = await import("node:net");`, "undeclared-capability"],
    ];
    for (const [body, rule] of cases) {
      const res = verify([MODULE_TS([], body)]);
      expect(res.ok, body).toBe(false);
      expect(res.issues.map((i) => i.rule), body).toContain(rule);
    }
    // A module importing its OWN files dynamically is still fine.
    expect(verify([MODULE_TS([], `const x = await import("./lib/util");`)]).ok).toBe(true);
  });

  it("enforces archive hygiene: file types, traversal and size", () => {
    const traversal = verify([MODULE_TS([]), { path: "../../evil.ts", bytes: 10, text: "x" }]);
    expect(traversal.issues.map((i) => i.rule)).toContain("path-traversal");

    const badType = verify([MODULE_TS([]), { path: "run.exe", bytes: 10 }]);
    expect(badType.issues.map((i) => i.rule)).toContain("file-type");

    const huge = verify([MODULE_TS([]), { path: "big.json", bytes: 5 * 1024 * 1024, text: "{}" }]);
    expect(huge.issues.map((i) => i.rule)).toContain("file-size");
  });

  it("requires a module.ts at the package root", () => {
    const res = verify([{ path: "src/module.ts", bytes: 10, text: "export default {};" }]);
    expect(res.ok).toBe(false);
    expect(res.issues.map((i) => i.rule)).toContain("no-entry");
  });
});
