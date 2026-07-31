import { helperIdForPermission, type DeclaredPermission, type ModulePermission } from "./types";

/*
 * Install-time verifier: refuses a package that reaches for an undeclared capability, uses a banned
 * construct, or imports core internals instead of going through its scoped `ctx`. Runs before the
 * source is written into `modules/` and compiled in.
 *
 * ⚠ **NOT a sandbox, and cannot be made one by static analysis.** Pattern-based: it catches
 *   accidents and makes the consented permission list honest. A determined author can obfuscate
 *   past it — the real boundary is trusting the source, which is why sources are pinned to a repo
 * and tag. REFS lib/modules/install.ts — the only caller of verifyModuleFiles() and formatIssues()
 *      lib/modules/sources.ts — the first gate, on the manifest rather than the folder
 */

/** REFS formatIssues() below — renders these for the admin and the audit detail. */
export type VerifyIssue = {
  file: string;
  /** Short machine-ish rule name, e.g. "banned-construct". */
  rule: string;
  detail: string;
};

/** REFS lib/modules/install.ts — refuses the install when `ok` is false. */
export type VerifyResult = {
  ok: boolean;
  issues: VerifyIssue[];
  /** Permissions parsed out of the module's own `module.ts`. */
  declaredPermissions: DeclaredPermission[];
  /** Helper ids parsed out of the module's own `module.ts`. */
  declaredHelpers: string[];
};

/**
 * Files a module may contain. Anything else — executables, archives — is refused.
 * REFS lib/modules/install.ts · lib/helpers/install.ts — both enforce this before unpacking
 */
export const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".sql", ".md", ".json", ".css", ".txt",
  ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico",
]);

/** REFS lib/modules/install.ts · lib/helpers/install.ts — both enforce these before unpacking. */
export const LIMITS = {
  maxFiles: 400,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
};

/** The only two core paths a module may import; everything else arrives on `ctx`. */
const ALLOWED_CORE_IMPORTS = ["@/lib/modules/types", "@/lib/modules/api"];

/**
 * All three ways to reach a specifier — `from`, `require()` and a literal `import()`.
 *
 * ⚠ A literal `await import("node:fs")` used to fall between the computed-import rule and the
 *   filesystem rule, so the one banned capability was reachable with ordinary code (BUG-27).
 *   **Add rules through this, not by hand**, or the next one gets two forms of three.
 */
function moduleSpecifier(spec: string): RegExp {
  return new RegExp(
    `\\bfrom\\s+["']${spec}["']` + // import x from "spec"
      `|\\brequire\\(\\s*["']${spec}["']\\s*\\)` + // require("spec")
      `|\\bimport\\(\\s*["']${spec}["']\\s*\\)`, // await import("spec")
  );
}

const BANNED: { rule: string; re: RegExp; detail: string }[] = [
  {
    rule: "banned-construct",
    re: moduleSpecifier("(?:node:)?child_process"),
    // Banned even though core itself shells out for ICMP — that is exactly why ctx.net.ping exists.
    detail: "spawns OS processes (use ctx.net.ping for ICMP; anything else must be asked for)",
  },
  {
    rule: "banned-construct",
    re: /(?<![.\w$])eval\s*\(/,
    detail: "eval() — executing constructed code is never allowed in a module",
  },
  {
    rule: "banned-construct",
    re: /\bnew\s+Function\s*\(/,
    detail: "new Function() — executing constructed code is never allowed in a module",
  },
  {
    rule: "banned-construct",
    // ⚠ Must sit where an expression can start. A bare "import (" also matched JSX TEXT — the label
    // "Bulk import (JSON)" was refused — and JSX text is neither comment nor string.
    re: /(?:^|[=(,;{}]|\b(?:await|return))\s*import\s*\(\s*(?!["'])/m,
    detail: "dynamic import() with a computed path — imports must be literal and reviewable",
  },
  {
    rule: "filesystem",
    re: moduleSpecifier("(?:node:)?fs(?:/promises)?"),
    detail: "direct filesystem access — a module's data belongs in ctx.db / ctx.store",
  },
  {
    rule: "core-internals",
    re: /\bfrom\s+["'](?:@prisma\/client|\.\.\/\.\.\/lib\/[^"']*)["']/,
    detail: "reaches into core internals directly instead of using ctx",
  },
  {
    rule: "env-access",
    re: /\bprocess\.env\b/,
    detail: "reads process environment — configuration belongs in the module's settings",
  },
];

/**
 * Imports that reveal a capability, mapped to the permission that must be declared. Raw sockets are
 * legitimate — `ctx.fetch` cannot do TCP/DNS/TLS — they just have to be **disclosed**, which is
 * what makes the consent screen truthful.
 */
const CAPABILITY_IMPORTS: { re: RegExp; permission: ModulePermission; detail: string }[] = [
  {
    re: moduleSpecifier("node:(?:net|dns|tls|http|https|dgram)(?:/promises)?"),
    permission: "network:outbound",
    detail: "opens raw network connections (TCP/DNS/TLS/HTTP)",
  },
  {
    // The lookbehind excludes `.fetch(` on purpose: `ctx.fetch(...)` is the sanctioned
    // path and is already gated by the context not having the field.
    re: /(?<![.\w$])fetch\s*\(/,
    permission: "network:outbound",
    detail: "calls the global fetch()",
  },
  {
    // ⚠ The lookbehind above let `globalThis.fetch(...)` through — same capability, longer name
    // (BUG-27). Named globals only — `ctx.fetch` must stay allowed, so not any `.fetch(`.
    re: /\b(?:globalThis|global|window|self)\s*\.\s*fetch\s*\(/,
    permission: "network:outbound",
    detail: "calls fetch() via globalThis",
  },
  {
    // ...and destructuring it off a global, e.g. `const { fetch: f } = globalThis`.
    re: /\{[^}]*\bfetch\b[^}]*\}\s*=\s*(?:globalThis|global|window|self)\b/,
    permission: "network:outbound",
    detail: "destructures fetch() off a global object",
  },
  {
    re: moduleSpecifier("node:crypto"),
    permission: "crypto:use",
    detail: "uses node crypto",
  },
];

/**
 * ⚠ Strip comments and prose first, or a rule word in a comment trips its own rule (BUG-39). Module
 *   specifiers are KEPT — they are what the import rules match on, and a specifier is
 *   distinguishable from prose by having no whitespace.
 */
const SPECIFIER = /^["'][@a-zA-Z0-9._/:~-]+["']$/;

function stripNoise(src: string): string {
  const blankProse = (m: string) => (SPECIFIER.test(m) ? m : m[0] + m[0]);
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ") // line comments (not "://")
    .replace(/`(?:\\.|[^`\\])*`/g, "``") // template literals
    .replace(/"(?:\\.|[^"\\])*"/g, blankProse)
    .replace(/'(?:\\.|[^'\\])*'/g, blankProse);
}

/** Only real code is scanned for JS constructs — docs and SQL aren't executed as JS. */
function isCodeFile(p: string): boolean {
  return /\.tsx?$/i.test(p.replace(/\\/g, "/"));
}

/** Every `@/...` path the source imports. */
function coreImportsIn(src: string): string[] {
  const out: string[] = [];
  const re = /\bfrom\s+["'](@\/[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/**
 * Permissions declared in the module's own `module.ts`. ⚠ Parsed, never executed — the point is to
 * check the code before it ever runs. PINS tests/unit/module-verify.test.ts
 */
export function parseDeclaredPermissions(moduleSource: string): DeclaredPermission[] {
  // ⚠ Strip first, or a commented-out worked example reads as a real declaration (BUG-39).
  const m = /permissions\s*:\s*\[([\s\S]*?)\]/.exec(stripNoise(moduleSource));
  if (!m) return [];
  const out: DeclaredPermission[] = [];
  // Core (`crypto:use`) and helper-namespaced (`filesystem:write`, `my-helper:read`) both.
  const re = /["']([a-z0-9][a-z0-9-]*:[a-z][a-z0-9:-]*)["']/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(m[1]))) out.push(hit[1]);
  return [...new Set(out)];
}

/**
 * Helper ids declared in the module's own `module.ts`, parsed never executed.
 * PINS tests/unit/helper-declarations.test.ts
 */
export function parseDeclaredHelpers(moduleSource: string): string[] {
  // ⚠ Strip first (BUG-39): a commented-out example becoming a real dependency would install the
  // helper, or roll the module back if that helper is not published on the channel.
  const m = /\bhelpers\s*:\s*\[([\s\S]*?)\]/.exec(stripNoise(moduleSource));
  if (!m) return [];
  const body = m[1];
  const out: string[] = [];

  /*
   * Two accepted forms (MOD-10): a bare id, or `{ id: "x", minVersion: "1.2.3" }`.
   *
   * ⚠ **The object form is parsed FIRST and its span removed.** Scanning the whole body for quoted
   *   slugs is wrong in both directions: `{ "id": "scheduler" }` yields a phantom helper called
   *   "id", and it dodges `"0.0.3"` only because versions contain dots. The key may be `id:` or
   *   `"id":` — missing the quoted form leaks it to the bare scan as a helper called "id".
   */
  let rest = body;
  const objRe = /\{[^{}]*["']?id["']?\s*:\s*["']([a-z0-9][a-z0-9-]{0,63})["'][^{}]*\}/g;
  let hit: RegExpExecArray | null;
  while ((hit = objRe.exec(body))) out.push(hit[1]);
  rest = body.replace(objRe, " ");

  const bareRe = /["']([a-z0-9][a-z0-9-]{0,63})["']/g;
  while ((hit = bareRe.exec(rest))) out.push(hit[1]);

  return [...new Set(out)];
}

/**
 * Verify a module package. Binaries are size- and extension-checked, never scanned.
 * REFS lib/modules/install.ts — refuses the install on `ok: false`
 * PINS tests/unit/module-verify.test.ts · tests/unit/helper-resolution.test.ts
 */
export function verifyModuleFiles(
  moduleId: string,
  files: { path: string; text?: string; bytes: number }[],
  manifestPermissions?: DeclaredPermission[],
): VerifyResult {
  const issues: VerifyIssue[] = [];
  const add = (file: string, rule: string, detail: string) => issues.push({ file, rule, detail });

  // ---- package shape + hygiene -------------------------------------------------
  if (files.length === 0) add(moduleId, "empty", "the package contains no files");
  if (files.length > LIMITS.maxFiles) {
    add(moduleId, "too-many-files", `${files.length} files (limit ${LIMITS.maxFiles})`);
  }
  let total = 0;
  for (const f of files) {
    total += f.bytes;
    const norm = f.path.replace(/\\/g, "/");
    if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm) || norm.split("/").includes("..")) {
      add(f.path, "path-traversal", "path escapes the module folder");
    }
    const dot = norm.lastIndexOf(".");
    const ext = dot === -1 ? "" : norm.slice(dot).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      add(f.path, "file-type", `"${ext || "(none)"}" is not an allowed module file type`);
    }
    if (f.bytes > LIMITS.maxFileBytes) {
      add(f.path, "file-size", `${f.bytes} bytes (limit ${LIMITS.maxFileBytes})`);
    }
  }
  if (total > LIMITS.maxTotalBytes) {
    add(moduleId, "package-size", `${total} bytes (limit ${LIMITS.maxTotalBytes})`);
  }

  const entry = files.find((f) => /^module\.tsx?$/.test(f.path.replace(/\\/g, "/")));
  if (!entry) add(moduleId, "no-entry", "no module.ts at the package root");

  const declaredPermissions = entry?.text ? parseDeclaredPermissions(entry.text) : [];
  const declaredHelpers = entry?.text ? parseDeclaredHelpers(entry.text) : [];

  // ⚠ An un-backed helper permission would put a capability on the consent screen that nothing can
  // deliver. The namespace IS the helper id, so no table here can drift from what helpers publish.
  for (const p of declaredPermissions) {
    // REFS lib/modules/types.ts › helperIdForPermission() · lib/helpers/types.ts › HelperCapability
    const needs = helperIdForPermission(p);
    if (needs && !declaredHelpers.includes(needs)) {
      add(
        "module.ts",
        "missing-helper",
        `declares "${p}", which only the "${needs}" helper provides — add it to \`helpers\``,
      );
    }
  }

  // ---- manifest must match the code -------------------------------------------
  if (manifestPermissions) {
    const a = [...declaredPermissions].sort().join(",");
    const b = [...new Set(manifestPermissions)].sort().join(",");
    if (a !== b) {
      add(
        "addons.json",
        "permission-mismatch",
        `the source lists [${b || "none"}] but the module declares [${a || "none"}]`,
      );
    }
  }

  // ---- per-file source rules ---------------------------------------------------
  for (const f of files) {
    if (f.text == null) continue; // binary asset: extension + size checked above
    if (!isCodeFile(f.path)) continue; // README prose isn't code — don't scan it as such
    const src = stripNoise(f.text);

    for (const b of BANNED) {
      if (b.re.test(src)) add(f.path, b.rule, b.detail);
    }

    for (const imp of coreImportsIn(src)) {
      // ⚠ Its OWN files only. Permitting any `@/modules/…` let a module sidestep another's
      // permission scoping, and coupled them invisibly: uninstall one, the other's build breaks.
      if (imp === `@/modules/${moduleId}` || imp.startsWith(`@/modules/${moduleId}/`)) continue;

      // ⚠ A declared helper's public entry point and only that — reaching into its internals
      // bypasses the narrow API. REFS lib/helpers/types.ts › HelperApiFor
      const helper = /^@\/helpers\/([a-z0-9-]+)\/api$/.exec(imp);
      if (helper) {
        if (!declaredHelpers.includes(helper[1])) {
          add(
            f.path,
            "undeclared-helper",
            `imports the "${helper[1]}" helper without declaring it in \`helpers\``,
          );
        }
        continue;
      }
      if (imp.startsWith("@/helpers/")) {
        add(f.path, "helper-internals", `imports "${imp}" — a module may only import a helper's /api`);
        continue;
      }

      if (!ALLOWED_CORE_IMPORTS.includes(imp)) {
        add(
          f.path,
          "core-internals",
          `imports "${imp}" — a module may only import ${ALLOWED_CORE_IMPORTS.join(" or ")}`,
        );
      }
    }

    for (const cap of CAPABILITY_IMPORTS) {
      if (cap.re.test(src) && !declaredPermissions.includes(cap.permission)) {
        add(
          f.path,
          "undeclared-capability",
          `${cap.detail} but "${cap.permission}" is not declared in module.ts`,
        );
      }
    }
  }

  return { ok: issues.length === 0, issues, declaredPermissions, declaredHelpers };
}

/** REFS lib/modules/install.ts — its only caller; the string reaches the admin and the audit log */
export function formatIssues(issues: VerifyIssue[]): string {
  return issues.map((i) => `${i.file}: ${i.detail}`).join("; ");
}
