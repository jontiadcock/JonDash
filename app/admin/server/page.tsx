import { requireAdmin } from "@/lib/auth/guards";
import { ServerPowerPanel } from "./server-power-panel";

export const dynamic = "force-dynamic";

export default async function AdminServerPowerPage() {
  // Restarting/shutting down the whole server is a privilege boundary (a delegate
  // could lock out the real admin), so this stays full-ADMIN only, not delegable.
  await requireAdmin();

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
    </div>
  );
}
