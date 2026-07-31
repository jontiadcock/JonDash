import { requireAdmin } from "@/lib/auth/guards";
import { readOpenBrowser } from "@/lib/launcher-prefs";
import { ServerPowerPanel } from "./server-power-panel";
import { setOpenBrowserAction } from "./startup-actions";

/** REFS lib/auth/guards.ts · lib/launcher-prefs.ts */

export const dynamic = "force-dynamic";

export default async function AdminServerPowerPage() {
  // Restarting/shutting down the whole server is a privilege boundary (a delegate
  // could lock out the real admin), so this stays full-ADMIN only, not delegable.
  await requireAdmin();
  const openBrowser = readOpenBrowser();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Server power</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Restart or shut down the dashboard server. These affect everyone using it.
        </p>
      </section>

      <section className="card p-6">
        <ServerPowerPanel />
      </section>

      {/* OPS-06 — startup behaviour lives here rather than in Settings because it is the
          launcher's behaviour, like everything else on this page. */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Startup</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          JonDash opens a browser the first time it starts on a machine — not on every restart.
          Turn that off for a server you reach from somewhere else.
        </p>
        <form action={setOpenBrowserAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="open" value={openBrowser ? "false" : "true"} />
          <span className="text-sm">
            Currently: <strong>{openBrowser ? "opens a browser" : "does not open a browser"}</strong>
          </span>
          <button type="submit" className="btn btn-ghost text-sm">
            {openBrowser ? "Don’t open a browser" : "Open a browser on first launch"}
          </button>
        </form>
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          On a machine you can’t see the screen of, set the <code>JONDASH_NO_BROWSER</code>{" "}
          environment variable instead — this switch can only help once you can already reach
          JonDash.
        </p>
      </section>
    </div>
  );
}
