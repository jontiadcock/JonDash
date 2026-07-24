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

  // BUG-36: reaching a running server means the build the `module-installing` marker was
  // guarding booted fine, so the install/rebuild is done — clear the marker. Left set, it
  // named a healthy module indefinitely, and the next unrelated build failure would hand
  // recovery that stale name and remove a module that had nothing to do with the failure.
  try {
    const { clearModuleInstalling } = await import("@/lib/modules/rebuild");
    clearModuleInstalling();
  } catch (e) {
    console.error("[instrumentation] could not clear module-installing marker:", e);
  }

  try {
    const { bootHelpers } = await import("@/lib/helpers/boot");
    await bootHelpers();
  } catch (e) {
    // Never fatal. A broken helper layer must not take the dashboard down with it.
    console.error("[instrumentation] helper boot failed:", e);
  }

  // Scheduled automatic updates for modules and helpers (BUG-30). Same reasoning as the
  // helper scheduler above: an update window of 03:00 is worthless if the timer only
  // starts when somebody opens a page. Separate try — a failure here must not stop
  // helpers booting, or vice versa.
  try {
    const { startUpdateScheduler } = await import("@/lib/updates/scheduler");
    startUpdateScheduler();
  } catch (e) {
    console.error("[instrumentation] update scheduler failed to start:", e);
  }
}
