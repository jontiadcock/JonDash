/*
 * Tiny semver helpers for the update checker. Pure — no I/O.
 *
 * ⚠ The tag format is an API, not a style: `X.Y.Z-beta.N` with a LITERAL DOT. `1.5.1-beta1` fails
 * the regex below, so `pre` becomes null and the beta ranks as the finished release — it would be
 * offered to stable users as done.
 * ⚠ A release outranks every pre-release of the same X.Y.Z, so an add-on needing a feature that
 * lands in 1.5.0 must declare `minAppVersion: "1.5.0-beta.1"` or nobody on beta can install it.
 * REFS scripts/update.mjs — the launcher-side consumer · lib/update.ts
 * PINS tests/unit/version.test.ts
 */

/** REFS lib/update.ts › UpdateStatus · scripts/update.mjs › TYPE_LABEL below */
export type ReleaseType = "major" | "minor" | "patch";

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  pre: number | null; // the N in `-beta.N`, or null for a stable release
};

/** ⚠ The regex IS the tag convention — see the note at the top before relaxing it.
 *  PINS tests/unit/version.test.ts */
export function parseVersion(v: string): ParsedVersion | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?/i.exec(String(v).trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] !== undefined ? Number(m[4]) : null,
  };
}

/** -1 if a < b, 0 if equal, 1 if a > b. ⚠ Unparseable versions compare EQUAL, so a malformed tag
 *  never reads as an upgrade. REFS lib/modules/updates.ts · lib/helpers/updates.ts ·
 *  lib/helpers/install.ts › minAppVersion — the gates it decides
 *  PINS tests/unit/version.test.ts */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (const k of ["major", "minor", "patch"] as const) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  // ⚠ Same X.Y.Z: a stable release (pre = null) outranks every pre-release — see the file note.
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1; // a is the release, b is a beta
  if (pb.pre === null) return -1; // b is the release, a is a beta
  return pa.pre < pb.pre ? -1 : 1; // both betas: compare the beta number
}

/** REFS lib/update.ts · scripts/update.mjs — the launcher uses the same rule pre-boot
 *  PINS tests/unit/version.test.ts */
export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/** The semver level that changed, for display. PINS tests/unit/version.test.ts */
export function diffType(current: string, latest: string): ReleaseType | null {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  if (!c || !l) return null;
  if (l.major !== c.major) return "major";
  if (l.minor !== c.minor) return "minor";
  if (l.patch !== c.patch) return "patch";
  return null;
}

/** REFS scripts/update.mjs — the launcher prints these; no in-app caller */
export const TYPE_LABEL: Record<ReleaseType, string> = {
  major: "Major update",
  minor: "Minor update",
  patch: "Security / bug-fix",
};
