import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ModuleChannel } from "./sources";

/**
 * Where a module came from — recorded at INSTALL time (MOD-01 Phase 2, chunk B fix).
 *
 * Provenance can't be inferred later: `enableModule` only sees a ModuleDefinition, which
 * says nothing about the repo or channel it was fetched from. Without this, every module
 * was recorded as `source: "bundled"`, which (a) silently broke the per-module beta
 * channel and (b) put source-installed modules inside the blast radius of
 * `pruneRemovedBundledModules` — so a module that failed to load once could have its
 * tables and data purged. See the shared log, 2026-07-22.
 *
 * Deliberately stored OUTSIDE the module folder, under `.data/modules/<id>.json`: a
 * module author controls every byte of their own package, so provenance kept in there
 * would be author-forgeable. `.data` is also preserved across app updates.
 */

export type ModuleProvenance = {
  /** Repo URL it was installed from, or "imported" for a sideloaded ZIP. */
  source: string;
  channel: ModuleChannel;
  version: string;
  installedAt: string;
};

function dataDir(): string {
  return process.env.JONDASH_DATA_DIR || path.join(process.cwd(), ".data");
}

function fileFor(moduleId: string): string {
  return path.join(dataDir(), "modules", `${moduleId}.json`);
}

export function writeProvenance(moduleId: string, p: Omit<ModuleProvenance, "installedAt">): void {
  const file = fileFor(moduleId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record: ModuleProvenance = { ...p, installedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
}

export function readProvenance(moduleId: string): ModuleProvenance | null {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(moduleId), "utf8")) as Partial<ModuleProvenance>;
    if (!raw || typeof raw.source !== "string" || !raw.source) return null;
    return {
      source: raw.source,
      channel: raw.channel === "beta" ? "beta" : "stable",
      version: typeof raw.version === "string" ? raw.version : "0.0.0",
      installedAt: typeof raw.installedAt === "string" ? raw.installedAt : "",
    };
  } catch {
    return null; // never installed from a source, or the file is unreadable
  }
}

export function removeProvenance(moduleId: string): void {
  fs.rmSync(fileFor(moduleId), { force: true });
}

/** Every module id we hold provenance for (i.e. was installed, not shipped). */
export function installedModuleIds(): string[] {
  try {
    return fs
      .readdirSync(path.join(dataDir(), "modules"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}
