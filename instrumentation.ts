/**
 * Server startup hook. Next calls `register()` ONCE per server instance, and it must
 * complete before any request is served.
 *
 * This exists for helpers (MOD-08): a scheduler that only starts when someone renders a
 * page is not a scheduler — restart at 03:00 and nothing runs until the dashboard is
 * opened at 08:00, which is exactly when you'd most want it working. Booting here makes
 * unattended work actually unattended.
 *
 * Because this blocks readiness, `bootHelpers` isolates each helper and bounds it: a
 * helper that throws or hangs is logged and skipped, never a reason the app won't start.
 */
export async function register() {
  // Next runs this in every runtime; the helper machinery is Node-only (database,
  // filesystem, timers), so the import must be conditional as the docs require.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { bootHelpers } = await import("@/lib/helpers/boot");
    await bootHelpers();
  } catch (e) {
    // Never fatal. A broken helper layer must not take the dashboard down with it.
    console.error("[instrumentation] helper boot failed:", e);
  }
}
