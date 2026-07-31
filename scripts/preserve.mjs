/*
 * What an update or rollback must never overwrite — the single definition, shared by
 * scripts/update.mjs and scripts/rollback.mjs.
 *
 * These are user data and regenerables: they aren't in the release archive, so copying
 * over them would destroy the install's content.
 *
 * CRITICAL — the match is on the FIRST PATH SEGMENT ONLY.
 * This previously also matched the entry NAME at any depth, which meant a directory
 * deep in the tree sharing a name with a preserved top-level folder was silently
 * skipped. `lib/modules/` (the entire module framework) collided with the top-level
 * `modules/` add-ons folder, so updates stopped copying it and the app could no longer
 * build — an unrecoverable install. Only ever compare the top-level segment.
 */
/** ⚠ Compared against the FIRST path segment only — see the note above. Adding a name here that
 *  also exists deeper in the tree is what bricked an install.
 *  REFS scripts/update.mjs · scripts/rollback.mjs — both must use `isPreserved`, never their own
 *  copy of this set  PINS tests/unit/preserve.test.ts */
export const PRESERVE = new Set([
  ".env", // local configuration
  ".data", // secrets, network config, install records
  "uploads", // user-uploaded icons
  "modules", // installed add-ons (top level ONLY — never lib/modules)
  "helpers", // installed helpers (top level ONLY — never lib/helpers)
  "node_modules",
  ".next",
  ".git",
  "logs",
]);

/**
 * Whether a repo-relative path is preserved — must not be copied over or deleted. ⚠ Only the FIRST
 * segment is considered; a basename match at any depth is the bug this exists to prevent.
 * REFS scripts/update.mjs · scripts/rollback.mjs  PINS tests/unit/preserve.test.ts
 */
export function isPreserved(rel) {
  if (!rel) return false;
  return PRESERVE.has(rel.split(/[\\/]/)[0]);
}
