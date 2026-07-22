// What an update or rollback must never overwrite — the single definition, shared by
// scripts/update.mjs and scripts/rollback.mjs.
//
// These are user data and regenerables: they aren't in the release archive, so copying
// over them would destroy the install's content.
//
// CRITICAL — the match is on the FIRST PATH SEGMENT ONLY.
// This previously also matched the entry NAME at any depth, which meant a directory
// deep in the tree sharing a name with a preserved top-level folder was silently
// skipped. `lib/modules/` (the entire module framework) collided with the top-level
// `modules/` add-ons folder, so updates stopped copying it and the app could no longer
// build — an unrecoverable install. Only ever compare the top-level segment.
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
 * Whether a repo-relative path is preserved (i.e. must not be copied over).
 * `rel` may use either separator; only its first segment is considered.
 */
export function isPreserved(rel) {
  if (!rel) return false;
  return PRESERVE.has(rel.split(/[\\/]/)[0]);
}
