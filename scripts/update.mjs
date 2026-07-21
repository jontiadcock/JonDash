#!/usr/bin/env node
// JonDash self-updater for ZIP installs of the PUBLIC repo (no Git, no token).
//
// Reads the public updates.json manifest and — on `apply` — downloads that
// version's source ZIP from GitHub's public archive, extracts it, and copies it
// over this folder.
//
//   node scripts/update.mjs check   -> prints status; exit 10 if an update exists
//   node scripts/update.mjs apply   -> downloads + installs the newest version
//
// User data is never touched: .env, .data, uploads and the SQLite database are
// gitignored, so they aren't in the downloaded archive and are left untouched.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function envValue(key) {
  if (process.env[key]) return process.env[key].trim();
  try {
    const txt = fs.readFileSync(path.join(REPO_DIR, ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {}
  return "";
}

function localVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO_DIR, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Parse X.Y.Z or X.Y.Z-beta.N (pre-release). pre = the beta number, or null for a release.
function parseVer(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?/i.exec(String(v).trim());
  return m
    ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] !== undefined ? Number(m[4]) : null }
    : null;
}
function isNewer(a, b) {
  const pa = parseVer(a), pb = parseVer(b);
  if (!pa || !pb) return false;
  for (const k of ["major", "minor", "patch"]) if (pa[k] !== pb[k]) return pa[k] > pb[k];
  // Same X.Y.Z: a release outranks any pre-release; else compare beta numbers.
  if (pa.pre === pb.pre) return false;
  if (pa.pre === null) return true;
  if (pb.pre === null) return false;
  return pa.pre > pb.pre;
}
const TYPE_LABEL = { major: "Major update", minor: "Minor update", patch: "Security / bug-fix" };

const REPO = envValue("UPDATE_REPO") || "jontiadcock/JonDash";
const UA = { "User-Agent": "JonDash-Updater" };

// Update channel (stable -> main branch, beta -> beta branch). Read from the same
// file the app writes; defaults to stable. The launcher runs before the app.
function channel() {
  try {
    const c = fs.readFileSync(path.join(REPO_DIR, ".data", "update-channel"), "utf8").trim().toLowerCase();
    if (c === "stable" || c === "beta") return c;
  } catch {}
  return "stable";
}

// Whether the launcher may auto-install an available update at startup. Off by
// default — otherwise JonDash only notifies and the user installs manually.
function autoInstall() {
  try {
    return fs.readFileSync(path.join(REPO_DIR, ".data", "auto-update"), "utf8").trim().toLowerCase() === "on";
  } catch {
    return false;
  }
}

// The last update that failed and was rolled back (so we don't auto-retry it).
function lastFailure() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(REPO_DIR, ".data", "update-failed"), "utf8"));
    return o && o.failedVersion ? o : null;
  } catch {
    return null;
  }
}

async function getLatest() {
  const branch = channel() === "beta" ? "beta" : "main";
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${branch}/updates.json`, {
    headers: { ...UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const manifest = JSON.parse(await res.text());
  return manifest?.releases?.[0] ?? null;
}

// ---- commands ----------------------------------------------------------------

async function cmdCheck() {
  const current = localVersion();
  let latest;
  try {
    latest = await getLatest();
  } catch {
    console.log("  Couldn't reach GitHub (offline or unavailable). Skipping update check.");
    return 0;
  }
  const ch = channel();
  if (!latest || !isNewer(latest.version, current)) {
    console.log(`  You're up to date (v${current}, ${ch} channel).`);
    return 0;
  }
  console.log("");
  console.log(`  An update is available:  v${latest.version}   (you have v${current}, ${ch} channel)`);
  console.log(`     Type: ${TYPE_LABEL[latest.type] ?? latest.type}      Priority: ${latest.criticality}`);
  console.log(`     ${latest.summary}`);
  return 10;
}

// Launch-time check that also decides whether to auto-install. Exit 10 ONLY when an
// update should be installed automatically now; otherwise notify and exit 0.
async function cmdAutoCheck() {
  const current = localVersion();
  let latest;
  try {
    latest = await getLatest();
  } catch {
    console.log("  Couldn't reach GitHub (offline or unavailable). Skipping update check.");
    return 0;
  }
  const ch = channel();
  if (!latest || !isNewer(latest.version, current)) {
    console.log(`  You're up to date (v${current}, ${ch} channel).`);
    return 0;
  }

  // A prior attempt on this exact version failed and was rolled back — don't retry.
  const failed = lastFailure();
  if (failed && failed.failedVersion === latest.version) {
    console.log("");
    console.log(`  Update v${latest.version} is available, but the last attempt failed and was rolled`);
    console.log(`  back to v${failed.revertedTo}. Install it manually from Admin -> Updates when ready.`);
    return 0;
  }

  console.log("");
  console.log(`  An update is available:  v${latest.version}   (you have v${current}, ${ch} channel)`);
  console.log(`     ${latest.summary}`);
  if (!autoInstall()) {
    console.log("  Auto-install is off — install it from Admin -> Updates (or enable auto-install there).");
    return 0;
  }
  console.log(`  Auto-install is on — installing v${latest.version}...`);
  return 10;
}

async function copyOver(srcRoot) {
  // Directories/files whose local contents must be preserved (never overwritten
  // by the archive — they hold user data / build artifacts and aren't in it).
  const PRESERVE = new Set([".env", ".data", "uploads", "node_modules", ".next", ".git", "logs"]);
  async function walk(relDir) {
    const entries = await fsp.readdir(path.join(srcRoot, relDir), { withFileTypes: true });
    for (const e of entries) {
      const rel = relDir ? path.join(relDir, e.name) : e.name;
      const top = rel.split(path.sep)[0];
      if (PRESERVE.has(top) || PRESERVE.has(e.name)) continue;
      const dest = path.join(REPO_DIR, rel);
      if (e.isDirectory()) {
        await fsp.mkdir(dest, { recursive: true });
        await walk(rel);
      } else {
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(path.join(srcRoot, rel), dest);
      }
    }
  }
  await walk("");
}

async function cmdApply() {
  const current = localVersion();
  const latest = await getLatest();
  if (!latest || !isNewer(latest.version, current)) {
    console.log("  Already up to date.");
    return 0;
  }

  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "jondash-update-"));
  const zipPath = path.join(tmp, "update.zip");
  const extractDir = path.join(tmp, "x");

  try {
    console.log(`  Downloading v${latest.version}...`);
    const res = await fetch(`https://github.com/${REPO}/archive/refs/tags/v${latest.version}.zip`, {
      headers: UA,
    });
    if (!res.ok) throw new Error(`download failed: GitHub ${res.status}`);
    await fsp.writeFile(zipPath, Buffer.from(await res.arrayBuffer()));

    console.log("  Extracting...");
    await fsp.mkdir(extractDir, { recursive: true });
    const ps = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`],
      { stdio: "inherit" },
    );
    if (ps.status !== 0) throw new Error("extraction failed (Expand-Archive)");

    // GitHub archives wrap everything in a single "<repo>-<version>" folder.
    const children = (await fsp.readdir(extractDir, { withFileTypes: true })).filter((d) => d.isDirectory());
    if (children.length !== 1) throw new Error("unexpected archive layout");
    const srcRoot = path.join(extractDir, children[0].name);

    // Sanity check before touching anything.
    if (!fs.existsSync(path.join(srcRoot, "package.json")) || !fs.existsSync(path.join(srcRoot, "app"))) {
      throw new Error("archive doesn't look like JonDash");
    }

    // Remove code dirs so files deleted upstream don't linger, then copy fresh.
    // These never contain user data.
    for (const dir of ["app", "lib"]) {
      await fsp.rm(path.join(REPO_DIR, dir), { recursive: true, force: true });
    }
    console.log("  Installing files...");
    await copyOver(srcRoot);

    console.log(`  Updated to v${latest.version}.`);
    return 0;
  } catch (err) {
    console.error(`  Update failed: ${err.message}`);
    console.error("  Your current install was left in place. You can retry, or download the ZIP manually.");
    return 1;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

const cmd = process.argv[2];
const run = cmd === "apply" ? cmdApply : cmd === "autocheck" ? cmdAutoCheck : cmdCheck;
// Set exitCode and let the process end on its own. Calling process.exit() here can
// race with the fetch socket tearing down and crash libuv on Windows (which would
// give a bogus non-zero code the launcher misreads as "update available").
run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e?.message ?? e);
    process.exitCode = 1;
  });
