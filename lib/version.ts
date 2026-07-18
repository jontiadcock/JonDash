// Tiny semver helpers (major.minor.patch) for the update checker. Pure — no I/O.

export type ReleaseType = "major" | "minor" | "patch";

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** -1 if a < b, 0 if equal, 1 if a > b. Unparseable versions compare as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/** The semver level that changed between current and latest (for display/validation). */
export function diffType(current: string, latest: string): ReleaseType | null {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  if (!c || !l) return null;
  if (l[0] !== c[0]) return "major";
  if (l[1] !== c[1]) return "minor";
  if (l[2] !== c[2]) return "patch";
  return null;
}

export const TYPE_LABEL: Record<ReleaseType, string> = {
  major: "Major update",
  minor: "Minor update",
  patch: "Security / bug-fix",
};
