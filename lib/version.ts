// Tiny semver helpers for the update checker. Pure — no I/O.
// Supports pre-release beta versions: `X.Y.Z-beta.N` (used by the beta channel).
// A release (no suffix) is newer than any pre-release of the same X.Y.Z.

export type ReleaseType = "major" | "minor" | "patch";

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  pre: number | null; // the N in `-beta.N`, or null for a stable release
};

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

/** -1 if a < b, 0 if equal, 1 if a > b. Unparseable versions compare as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (const k of ["major", "minor", "patch"] as const) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  // Same X.Y.Z: a stable release (pre = null) outranks any pre-release.
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1; // a is the release, b is a beta
  if (pb.pre === null) return -1; // b is the release, a is a beta
  return pa.pre < pb.pre ? -1 : 1; // both betas: compare the beta number
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/** The semver level that changed between current and latest (for display/validation). */
export function diffType(current: string, latest: string): ReleaseType | null {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  if (!c || !l) return null;
  if (l.major !== c.major) return "major";
  if (l.minor !== c.minor) return "minor";
  if (l.patch !== c.patch) return "patch";
  return null;
}

export const TYPE_LABEL: Record<ReleaseType, string> = {
  major: "Major update",
  minor: "Minor update",
  patch: "Security / bug-fix",
};
