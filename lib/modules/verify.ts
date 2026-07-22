import { helperIdForPermission, type DeclaredPermission, type ModulePermission } from "./types";

/**
 * Install-time module verifier (MOD-01 Phase 2, chunk B).
 *
 * Runs over a module's source BEFORE it is written into `modules/` and compiled into the
 * app. It refuses a package that reaches for a capability it didn't declare, uses a
 * construct no module has a legitimate need for, or imports core internals instead of
 * going through its scoped `ctx`.
 *
 * HONEST LIMIT — read this before trusting it. Modules compile into the app and run
 * in-process, so this is **not** a sandbox and cannot be made into one by static
 * analysis. It is pattern-based: it reliably catches accidents, undeclared capabilities
 * and casual abuse, and it makes the permission list the admin consents to *honest*. A
 * determined author could obfuscate past it. The real trust boundary is still "do you
 * trust the source you installed from" — which is why sources are pinned to a repo + tag.
 */

export type VerifyIssue = {
  file: string;
  /** Short machine-ish rule name, e.g. "banned-construct". */
  rule: string;
  detail: string;
};

export type VerifyResult = {
  ok: boolean;
  issues: VerifyIssue[];
  /** Permissions parsed out of the module's own `module.ts`. */
  declaredPermissions: DeclaredPermission[];
  /** Helper ids parsed out of the module's own `module.ts`. */
  declaredHelpers: string[];
};

/**
 * Permissions that only a HELPER can provide (MOD-08). A module may declare one only if
 * it also declares a helper that provides it — the helper does the privileged work, the
 * admin approved the effect, and the module never touches the primitive itself.
 *
 * There is deliberately NO list of them here. The namespace IS the helper id, so
 * `filesystem:write` requires the `filesystem` helper and `backup:restore` requires
 * `backup` — derived by `helperIdForPermission`, never a table that can drift out of step
 * with what helpers actually publish. (It used to be a hardcoded `files:read`/`files:write`
 * map, which is exactly the coupling that stopped a new helper naming its own capability
 * without a core release.)
 */

/** Files a module may contain. Anything else (executables, archives, …) is refused. */
export const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".sql", ".md", ".json", ".css", ".txt",
  ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico",
]);

export const LIMITS = {
  maxFiles: 400,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
};

/** The only two core paths a module may import; everything else arrives on `ctx`. */
const ALLOWED_CORE_IMPORTS = ["@/lib/modules/types", "@/lib/modules/api"];

/**
 * Constructs no module has a legitimate reason to use. `child_process` is banned even
 * though the framework itself shells out for ICMP — that's exactly why `ctx.net.ping`
 * exists: the hardening lives once in trusted core code.
 */
const BANNED: { rule: string; re: RegExp; detail: string }[] = [
  {
    rule: "banned-construct",
    re: /\bfrom\s+["']node:child_process["']|\brequire\(\s*["'](?:node:)?child_process["']\s*\)|\bfrom\s+["']child_process["']/,
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
    // Must sit where an expression can start (after =, (, ,, ;, {, }, await, return, or
    // a line start). Matching a bare "import (" also hit ordinary English in JSX TEXT —
    // a UI label reading "Bulk import (JSON)" was refused as a computed import. JSX text
    // is neither a comment nor a string literal, so the noise stripper can't help.
    re: /(?:^|[=(,;{}]|\b(?:await|return))\s*import\s*\(\s*(?!["'])/m,
    detail: "dynamic import() with a computed path — imports must be literal and reviewable",
  },
  {
    rule: "filesystem",
    re: /\bfrom\s+["'](?:node:)?fs(?:\/promises)?["']|\brequire\(\s*["'](?:node:)?fs(?:\/promises)?["']\s*\)/,
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
 * Imports that reveal a capability, mapped to the permission that must be declared.
 * Raw sockets are legitimate (ctx.fetch can't do TCP/DNS/TLS/timings) — they just have
 * to be disclosed, which is what makes the consent screen truthful.
 */
const CAPABILITY_IMPORTS: { re: RegExp; permission: ModulePermission; detail: string }[] = [
  {
    re: /\bfrom\s+["']node:(?:net|dns|tls|http|https|dgram)(?:\/promises)?["']/,
    permission: "network:outbound",
    detail: "opens raw network connections (TCP/DNS/TLS/HTTP)",
  },
  {
    re: /(?<![.\w$])fetch\s*\(/,
    permission: "network:outbound",
    detail: "calls the global fetch()",
  },
  {
    re: /\bfrom\s+["']node:crypto["']/,
    permission: "crypto:use",
    detail: "uses node crypto",
  },
];

/**
 * Strip comments and prose strings so a rule word in a comment or a message can't trip a
 * rule. Module specifiers are KEPT — they're exactly what the import rules match on — and
 * a specifier is distinguishable from prose by having no whitespace.
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
 * Permissions declared in the module's own `module.ts`. Parsed rather than executed —
 * the point is to check the code before it ever runs.
 */
export function parseDeclaredPermissions(moduleSource: string): DeclaredPermission[] {
  const m = /permissions\s*:\s*\[([\s\S]*?)\]/.exec(moduleSource);
  if (!m) return [];
  const out: DeclaredPermission[] = [];
  // Core (`crypto:use`) and helper-namespaced (`filesystem:write`, `my-helper:read`) both.
  const re = /["']([a-z0-9][a-z0-9-]*:[a-z][a-z0-9:-]*)["']/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(m[1]))) out.push(hit[1]);
  return [...new Set(out)];
}

/** Helper ids declared in the module's own `module.ts` (parsed, never executed). */
export function parseDeclaredHelpers(moduleSource: string): string[] {
  const m = /\bhelpers\s*:\s*\[([\s\S]*?)\]/.exec(moduleSource);
  if (!m) return [];
  const out: string[] = [];
  const re = /["']([a-z0-9][a-z0-9-]{0,63})["']/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(m[1]))) out.push(hit[1]);
  return [...new Set(out)];
}

/**
 * Verify a module package. `files` maps a module-relative path to its contents (text
 * files as strings, binary as byte length only — binaries are size/extension checked,
 * never scanned).
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

  // A helper-provided permission is meaningless without the helper that implements it —
  // and allowing it un-backed would put a capability on the consent screen that nothing
  // can actually deliver.
  for (const p of declaredPermissions) {
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
      // Its OWN files only. This used to permit any `@/modules/…` path, so a module could
      // reach into another module's internals — sidestepping that module's permission
      // scoping, and coupling the two invisibly (uninstall one, the other's build breaks
      // and auto-recovery removes the innocent party).
      if (imp === `@/modules/${moduleId}` || imp.startsWith(`@/modules/${moduleId}/`)) continue;

      // A declared helper's public entry point — and only that. Reaching into a helper's
      // internals would let a module bypass the narrow API that makes privileged work
      // reviewable in the first place.
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

/** One-line-per-issue summary for the admin UI / audit detail. */
export function formatIssues(issues: VerifyIssue[]): string {
  return issues.map((i) => `${i.file}: ${i.detail}`).join("; ");
}
