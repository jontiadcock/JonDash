import "server-only";

/**
 * The ONLY core runtime surface a module may import (MOD-01 Phase 3).
 *
 * ⚠ Everything else under `lib/` is a core internal. Importing `lib/db`, `lib/crypto` or the
 * framework's own store/migrate/manage/registry bypasses the permission scoping that makes a
 * module's consent screen mean anything. Everything else a module needs arrives on its `ctx`.
 *
 * ⚠ This file and the verifier's allowlist are ONE decision in two places. Add an export here
 * without widening that list and a module cannot use it; widen the list without adding it here and
 * a module reaches a core internal.
 * REFS lib/modules/verify.ts › ALLOWED_CORE_IMPORTS — the enforcing half
 *      lib/modules/types.ts — the other permitted import; carries no `server-only` on purpose
 *      docs/MODULES-AUTHORING.md — the third-party contract this states
 */

export { moduleAction } from "./actions";
export { systemModuleContext } from "./context";
