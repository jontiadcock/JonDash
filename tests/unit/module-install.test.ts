import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import {
  archiveUrlFor,
  extractModuleFromArchive,
  installModuleFromZip,
  writeModuleFiles,
  removeModuleFiles,
  moduleFilesExist,
  peekZipModuleId,
  InstallError,
} from "@/lib/modules/install";

// The installer treats every archive as hostile: it comes off the internet and is about
// to be compiled into the app. These cover the path-safety and verification gates.

const ID = "ziptest";
const MODULE_SRC = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "${ID}", name: "Zip test", description: "d", version: "2.1.0", minAppVersion: "1.4.0",
  permissions: [],
};
export default mod;
`;

/** A GitHub-shaped archive: everything wrapped in one <repo>-<tag> folder. */
function githubArchive(files: Record<string, string>, wrapper = "JonDash-addons-health-monitor-v1.0.0") {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[`${wrapper}/${name}`] = strToU8(content);
  }
  return zipSync(entries);
}

afterAll(() => {
  removeModuleFiles(ID);
});

describe("module installer", () => {
  it("builds a pinned tag archive URL, encoding each tag segment", () => {
    const url = archiveUrlFor("https://github.com/jontiadcock/JonDash-addons", "health-monitor/v1.0.0");
    expect(url).toBe(
      "https://github.com/jontiadcock/JonDash-addons/archive/refs/tags/health-monitor/v1.0.0.zip",
    );
    // The namespaced separator survives, but anything odd in a segment is encoded.
    expect(archiveUrlFor("https://github.com/a/b", "my+mod/v1.0.0")).toContain("my%2Bmod/v1.0.0");
  });

  it("rejects a non-GitHub source or a whitespace tag", () => {
    expect(() => archiveUrlFor("https://evil.example.com/a/b", "v1")).toThrow(InstallError);
    expect(() => archiveUrlFor("https://github.com/a/b", "v 1\n")).toThrow(InstallError);
  });

  it("pulls only addons/<id>/** out of the wrapper folder", () => {
    const zip = githubArchive({
      "README.md": "repo readme",
      "addons.json": "{}",
      [`addons/${ID}/module.ts`]: MODULE_SRC,
      [`addons/${ID}/MODULE.md`]: "# doc",
      "addons/other-module/module.ts": "other",
    });
    const files = extractModuleFromArchive(zip, ID);
    expect(files.map((f) => f.path).sort()).toEqual(["MODULE.md", "module.ts"]);
    expect(files.find((f) => f.path === "module.ts")?.text).toContain("Zip test");
  });

  it("fails clearly when the archive doesn't contain that module", () => {
    const zip = githubArchive({ "addons/something-else/module.ts": "x" });
    expect(() => extractModuleFromArchive(zip, ID)).toThrow(/doesn't contain/);
  });

  it("refuses a package whose paths escape the module folder", () => {
    const zip = githubArchive({ [`addons/${ID}/../../evil.ts`]: "pwn" });
    expect(() => extractModuleFromArchive(zip, ID)).toThrow(InstallError);
  });

  it("refuses an unreadable archive", () => {
    expect(() => extractModuleFromArchive(strToU8("not a zip at all"), ID)).toThrow(InstallError);
  });

  it("imports a ZIP the admin supplied, running the same verification", async () => {
    const zip = zipSync({
      [`${ID}/module.ts`]: strToU8(MODULE_SRC),
      [`${ID}/MODULE.md`]: strToU8("# doc"),
    });
    const outcome = await installModuleFromZip(zip);
    expect(outcome.moduleId).toBe(ID);
    expect(outcome.version).toBe("2.1.0");
    expect(moduleFilesExist(ID)).toBe(true);

    removeModuleFiles(ID);
    expect(moduleFilesExist(ID)).toBe(false);
  });

  it("refuses an imported ZIP that fails verification", async () => {
    const bad = MODULE_SRC.replace("export default mod;", 'import cp from "node:child_process";\nexport default mod;');
    const zip = zipSync({ [`${ID}/module.ts`]: strToU8(bad) });
    await expect(installModuleFromZip(zip)).rejects.toThrow(/failed verification/);
    expect(moduleFilesExist(ID)).toBe(false); // nothing written when a check fails
  });

  it("refuses a ZIP with no module.ts", async () => {
    const zip = zipSync({ "somewhere/readme.md": strToU8("# nope") });
    await expect(installModuleFromZip(zip)).rejects.toThrow(/module\.ts/);
  });

  it("swaps files in atomically and leaves no staging folder behind", () => {
    writeModuleFiles(ID, [
      { path: "module.ts", bytes: 10, data: strToU8(MODULE_SRC), text: MODULE_SRC },
      { path: "migrations/001_init.sql", bytes: 10, data: strToU8("SELECT 1;") },
    ]);
    const dir = path.join(process.cwd(), "modules", ID);
    expect(fs.existsSync(path.join(dir, "migrations", "001_init.sql"))).toBe(true);
    expect(fs.existsSync(`${dir}.installing`)).toBe(false);

    removeModuleFiles(ID);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("refuses a module id that isn't a safe slug", () => {
    expect(() => removeModuleFiles("../../etc")).toThrow(InstallError);
  });
});

/**
 * REGRESSION (BUG-19, 2026-07-22). The import path wrote a module's files, then returned
 * an error if its declared helper couldn't be resolved — WITHOUT removing what it had just
 * written. The admin was told the import failed, but the folder stayed in modules/ and the
 * next unrelated rebuild compiled the module in WITHOUT its helper, so its scheduled work
 * silently never ran. Found by reading, not by running, so it gets a test that runs.
 */
describe("peeking a ZIP before writing it (BUG-19 rollback support)", () => {
  const PEEK_SRC = `
import type { ModuleDefinition } from "@/lib/modules/types";
const mod: ModuleDefinition = {
  id: "peeked", name: "Peeked", description: "d", version: "1.0.0", minAppVersion: "1.5.0",
  permissions: [], helpers: ["scheduler"],
};
export default mod;`;

  it("reports the module id a ZIP would install, writing nothing", () => {
    const zip = zipSync({ "peeked/module.ts": strToU8(PEEK_SRC) });
    expect(peekZipModuleId(zip)).toBe("peeked");
    // Nothing may be created just by looking.
    expect(fs.existsSync(path.join(process.cwd(), "modules", "peeked"))).toBe(false);
  });

  it("returns null for a ZIP with no module, rather than throwing", () => {
    expect(peekZipModuleId(zipSync({ "readme.md": strToU8("# no module") }))).toBeNull();
    expect(peekZipModuleId(strToU8("not a zip"))).toBeNull();
  });

  it("refuses an unsafe folder name instead of reporting it as an id", () => {
    expect(peekZipModuleId(zipSync({ "../evil/module.ts": strToU8(PEEK_SRC) }))).toBeNull();
  });
});
