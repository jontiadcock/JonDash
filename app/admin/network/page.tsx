import { requirePermission } from "@/lib/auth/guards";
import { readNetworkConfig, readTlsStatus, describeInstalledCert } from "@/lib/tls/network";
import { NetworkForm } from "./ui";
import { CertPanel } from "./cert-panel";
import { PublicAddressForm } from "./public-address";
import { getPublicUrlSetting } from "@/lib/settings";

/** REFS lib/auth/guards.ts · lib/tls/network.ts · lib/settings.ts */

export const dynamic = "force-dynamic";

const STATE_COLOR: Record<string, string> = {
  ok: "var(--primary)",
  issuing: "var(--warning, #b8860b)",
  error: "var(--danger)",
  idle: "var(--muted)",
};

function fmt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default async function NetworkPage() {
  await requirePermission("network.manage");
  const config = readNetworkConfig();
  const status = readTlsStatus();
  const tlsOn = config.mode !== "off";
  const cert = describeInstalledCert(config);
  const publicUrl = await getPublicUrlSetting().catch(() => "");
  /*
   * "Being served" is now read from what the LISTENER recorded when it bound the credential
   * (`servingNotAfter`, written only by `startHttps`), not inferred by comparing two files.
   *
   * **The inference was wrong in both directions.** It compared `status.notAfter` — written by
   * *issuance* — against the certificate on disk. On a Let's Encrypt restart nothing writes status
   * at all, so a perfectly-served certificate showed "not until you restart" (owner-reported,
   * 2026-07-30, after restarting twice); and immediately after issuing from this page it would have
   * claimed the opposite, because issuance had just written a matching expiry while the running
   * listener still held the old credential.
   */
  const serving = !!cert?.ok && !!cert.notAfter && status.servingNotAfter === cert.notAfter;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Network &amp; HTTPS</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Choose how the dashboard is served — plain HTTP, an automatic Let&apos;s Encrypt
          certificate, or your own certificate — and which ports it listens on. Requires the
          Network &amp; HTTPS capability (full admins have it).
        </p>
      </section>

      <section className="card p-6">
        <NetworkForm config={config} />
      </section>

      {/* Moved from General in 1.8.3 (owner request): it is the same question as the ports and the
          certificate above — how is this install reached from outside — and its value has to agree
          with them. Its own card because it writes the settings table, not `.data/network.json`. */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Public address</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          The address JonDash puts in emails it sends. It can&apos;t work this out on its own — the
          address a request arrives with can be forged, so a link built from it could point somewhere
          else entirely.
        </p>
        <PublicAddressForm value={publicUrl} />
      </section>

      {/* Read here, not in the client component — it is a server env var. */}
      <CertPanel
        config={config}
        cert={cert}
        serving={serving}
        staging={process.env.ACME_STAGING === "1"}
      />

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
