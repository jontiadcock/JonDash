import { requireAdmin } from "@/lib/auth/guards";
import { readNetworkConfig, readTlsStatus } from "@/lib/tls/network";
import { NetworkForm } from "./ui";

export const dynamic = "force-dynamic";

const STATE_COLOR: Record<string, string> = {
  ok: "var(--primary)",
  issuing: "var(--warning, #b8860b)",
  error: "var(--destructive, #dc2626)",
  idle: "var(--muted)",
};

function fmt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default async function NetworkPage() {
  await requireAdmin();
  const config = readNetworkConfig();
  const status = readTlsStatus();
  const tlsOn = config.mode !== "off";

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Network &amp; HTTPS</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Choose how the dashboard is served — plain HTTP, an automatic Let&apos;s Encrypt
          certificate, or your own certificate — and which ports it listens on. Only full admins
          can change these.
        </p>
      </section>

      <section className="card p-6">
        <NetworkForm config={config} />
      </section>

      {tlsOn && (
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Certificate status</h2>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--muted)" }}>State</dt>
              <dd style={{ color: STATE_COLOR[status.state] ?? "var(--foreground)" }}>
                {status.state || "idle"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--muted)" }}>Domain</dt>
              <dd>{status.domain || config.domain || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--muted)" }}>Issuer</dt>
              <dd>{status.issuer || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--muted)" }}>Expires</dt>
              <dd>{fmt(status.notAfter)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--muted)" }}>Last renewal</dt>
              <dd>{fmt(status.lastRenewal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--muted)" }}>Checked</dt>
              <dd>{fmt(status.updatedAt ?? "")}</dd>
            </div>
          </dl>
          {status.lastError && (
            <p className="form-error mt-4">Last error: {status.lastError}</p>
          )}
        </section>
      )}
    </div>
  );
}
