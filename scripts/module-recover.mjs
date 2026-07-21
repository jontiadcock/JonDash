// Module build-failure recovery (MOD-01 Phase 2, chunk B).
//
// The launcher runs this when a build fails while a module install/update was in flight
// (.data/module-installing names it). It removes that module's source, regenerates the
// registry so the next build compiles without it, and records what happened so the app
// can tell the admin. The launcher then retries the build from a known-good state.
//
// One-shot by construction: the marker is deleted here, so a second failure falls
// through to the launcher's normal clean-rebuild / snapshot-rollback recovery.
//
// Plain JS, run directly by Node (never imported).
import fs from "node:fs";
import path from "node:path";
import { appendLog } from "./log.mjs";
import { writeRegistry } from "./gen-module-registry.mjs";

const ROOT = process.env.JONDASH_ROOT
  ? path.resolve(process.env.JONDASH_ROOT)
  : path.resolve(import.meta.dirname, "..");
const INSTALLING = path.join(ROOT, ".data", "module-installing");
const FAILED = path.join(ROOT, ".data", "module-failed");

function read(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

const moduleId = read(INSTALLING);

// Clear the marker FIRST: if anything below throws, the next failure must not loop back
// into this same recovery.
fs.rmSync(INSTALLING, { force: true });

if (!moduleId || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(moduleId)) {
  appendLog("recovery", "module", "no module to remove (marker missing or invalid)");
} else {
  const dir = path.join(ROOT, "modules", moduleId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(`${dir}.installing`, { recursive: true, force: true });
    appendLog("recovery", "module", `removed "${moduleId}" after a failed build`);
  } catch (e) {
    appendLog("recovery", "module", `could not remove "${moduleId}": ${e?.message ?? e}`);
  }

  try {
    writeRegistry();
  } catch (e) {
    appendLog("recovery", "module", `registry regeneration failed: ${e?.message ?? e}`);
  }

  try {
    fs.mkdirSync(path.dirname(FAILED), { recursive: true });
    fs.writeFileSync(FAILED, `${moduleId}\n${new Date().toISOString()}\n`, "utf8");
  } catch {
    /* best effort — the log above is the durable record */
  }
}
