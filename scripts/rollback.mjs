#!/usr/bin/env node
// JonDash rollback helper (OPS-10).
//
// Snapshots the current source before an update, and restores it if the update
// fails (build error or boot-crash) — reverting to a like-for-like copy of what
// was running before. The snapshot lives under .data/rollback/ (preserved by the
// updater, gitignored). Source only — never node_modules/.next or user data.
//
//   node scripts/rollback.mjs backup    -> snapshot the current source + version
//   node scripts/rollback.mjs restore   -> restore the snapshot over the install
//   node scripts/rollback.mjs version   -> print the snapshot's version (or nothing)
//
// The ROOT can be overridden with JONDASH_ROOT for tests.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.JONDASH_ROOT
  ? path.resolve(process.env.JONDASH_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAP_ROOT = path.join(ROOT, ".data", "rollback");
const SNAP_DIR = path.join(SNAP_ROOT, "snapshot");
const SNAP_VERSION = path.join(SNAP_ROOT, "version");

// Never snapshot/overwrite: user data + regenerables (mirrors update.mjs PRESERVE),
// and the SQLite database files (which live under prisma/).
const PRESERVE = new Set([".env", ".data", "uploads", "modules", "node_modules", ".next", ".git", "logs"]);
const isDbFile = (rel) => /(^|[\\/])prisma[\\/][^\\/]*\.db($|[-.])/i.test(rel);

function appVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Copy every non-preserved, non-DB file from srcRoot into dstRoot, recursively. */
async function copyTree(srcRoot, dstRoot, relDir = "") {
  const entries = await fsp.readdir(path.join(srcRoot, relDir), { withFileTypes: true });
  for (const e of entries) {
    const rel = relDir ? path.join(relDir, e.name) : e.name;
    const top = rel.split(path.sep)[0];
    if (PRESERVE.has(top) || PRESERVE.has(e.name)) continue;
    if (isDbFile(rel)) continue;
    const dst = path.join(dstRoot, rel);
    if (e.isDirectory()) {
      await fsp.mkdir(dst, { recursive: true });
      await copyTree(srcRoot, dstRoot, rel);
    } else {
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.copyFile(path.join(srcRoot, rel), dst);
    }
  }
}

async function backup() {
  await fsp.rm(SNAP_DIR, { recursive: true, force: true });
  await fsp.mkdir(SNAP_DIR, { recursive: true });
  await copyTree(ROOT, SNAP_DIR);
  await fsp.mkdir(SNAP_ROOT, { recursive: true });
  await fsp.writeFile(SNAP_VERSION, appVersion(), "utf8");
  console.log(`  Snapshot saved (v${appVersion()}) — can roll back if the update fails.`);
  return 0;
}

async function restore() {
  if (!fs.existsSync(SNAP_DIR)) {
    console.error("  No rollback snapshot to restore.");
    return 1;
  }
  // Remove code dirs so files added by the bad update don't linger, then copy back.
  for (const dir of ["app", "lib"]) await fsp.rm(path.join(ROOT, dir), { recursive: true, force: true });
  await copyTree(SNAP_DIR, ROOT);
  const v = fs.existsSync(SNAP_VERSION) ? fs.readFileSync(SNAP_VERSION, "utf8").trim() : "?";
  console.log(`  Restored the previous version (v${v}).`);
  return 0;
}

function snapshotVersion() {
  if (fs.existsSync(SNAP_VERSION)) process.stdout.write(fs.readFileSync(SNAP_VERSION, "utf8").trim());
  return 0;
}

/** Record that an update failed and was rolled back, so the app can show a notice
 *  and the launcher won't auto-retry it. revertedTo = the restored snapshot version. */
async function markFailed(failedVersion) {
  const revertedTo = fs.existsSync(SNAP_VERSION) ? fs.readFileSync(SNAP_VERSION, "utf8").trim() : "";
  const rec = { failedVersion: failedVersion || "unknown", revertedTo, at: new Date().toISOString() };
  await fsp.mkdir(path.join(ROOT, ".data"), { recursive: true });
  await fsp.writeFile(path.join(ROOT, ".data", "update-failed"), JSON.stringify(rec), "utf8");
  console.log("  Recorded the failed update — it won't be auto-retried; update manually when ready.");
  return 0;
}

const cmd = process.argv[2];
const runners = {
  backup,
  restore,
  version: async () => snapshotVersion(),
  "mark-failed": async () => markFailed(process.argv[3]),
};
const run = runners[cmd];
if (!run) {
  console.error("usage: rollback.mjs backup|restore|version");
  process.exitCode = 2;
} else {
  run()
    .then((code) => {
      process.exitCode = code ?? 0;
    })
    .catch((e) => {
      console.error(`  Rollback ${cmd} failed: ${e?.message ?? e}`);
      process.exitCode = 1;
    });
}
