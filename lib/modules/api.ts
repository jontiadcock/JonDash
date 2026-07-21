import "server-only";

/**
 * The ONLY core runtime surface a module may import (MOD-01 Phase 3).
 *
 * Everything else under `lib/` is a core internal: importing `lib/db`, `lib/crypto`,
 * `lib/email/*`, or the framework's own `store`/`migrate`/`manage`/`registry` would
 * bypass the permission scoping that makes a module's consent screen meaningful. The
 * installer's verifier enforces exactly that, and it only has to allow two paths:
 *
 *   - `@/lib/modules/types` — types only, safe to import from a client component
 *     (it deliberately carries no `server-only`).
 *   - `@/lib/modules/api`   — this file: server-side runtime helpers.
 *
 * Everything else a module needs arrives on its scoped `ctx`.
 */

export { moduleAction } from "./actions";
export { systemModuleContext } from "./context";
