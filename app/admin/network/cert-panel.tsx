"use client";

import { useActionState } from "react";
import type { CertSummary, NetworkConfig } from "@/lib/tls/network";
import {
  generateSelfSignedAction,
  importCertAction,
  requestCertificateAction,
  type NetworkState,
} from "./actions";

const initial: NetworkState = {};

const VALIDITY = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 1095, label: "3 years" },
  { days: 2555, label: "7 years" },
];

function Outcome({ state }: { state: NetworkState }) {
  if (state.error) return <p className="form-error mt-3">{state.error}</p>;
  if (state.ok)
    return (
      <p className="mt-3 text-sm" style={{ color: "var(--success)" }}>
        {state.message ?? "Done."}
      </p>
    );
  return null;
}

/**
 * What is installed right now — the answer to "is this the right certificate, and when does it
 * stop working?" (OPS-07).
 *
 * Shown against the **files on disk**, not the last startup's status, so a certificate generated or
 * imported a moment ago appears here immediately with "restart to apply" beside it. Those two being
 * allowed to disagree is the point: it is how you can tell the difference between *installed* and
 * *being served*.
 */
export function CertPanel({
  config,
  cert,
  serving,
  staging,
}: {
  config: NetworkConfig;
  cert: CertSummary | null;
  /** Whether the running server is actually serving this pair. */
  serving: boolean;
  /**
   * `ACME_STAGING=1` is set, so Let's Encrypt requests go to the staging service.
   *
   * **Surfaced because it was invisible.** The flag existed only in a code comment, which meant the
   * one safety valve against burning Let's Encrypt's rate limits was unknown to the person about to
   * hit them — and a staging certificate is **not trusted by browsers**, so someone testing with it
   * on would see the same warning as before and reasonably conclude the feature was broken.
   */
  staging: boolean;
}) {
  const [genState, generate, generating] = useActionState(generateSelfSignedAction, initial);
  const [impState, importCert, importing] = useActionState(importCertAction, initial);
  const [reqState, request, requesting] = useActionState(requestCertificateAction, initial);

  if (config.mode === "off") return null;

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Installed certificate</h2>
        {!cert ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {config.mode === "selfsigned"
              ? "None yet — generate one below."
              : config.mode === "byo"
                ? "None yet — import your certificate and key below."
                : "None yet — request one below, or restart and JonDash will ask for one at startup."}
          </p>
        ) : !cert.ok ? (
          <p className="form-error">This file isn&apos;t a certificate JonDash can read: {cert.error}</p>
        ) : (
          <>
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--muted)" }}>Issued to</dt>
                <dd>{cert.subject || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--muted)" }}>Issued by</dt>
                <dd>{cert.selfSigned ? "itself (self-signed)" : cert.issuer || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--muted)" }}>Expires</dt>
                <dd
                  style={{
                    color: cert.expired
                      ? "var(--danger)"
                      : (cert.daysLeft ?? 99) < 30
                        ? "var(--warning)"
                        : undefined,
                  }}
                >
                  {cert.notAfter ? new Date(cert.notAfter).toLocaleDateString() : "—"}
                  {cert.expired
                    ? " — expired"
                    : typeof cert.daysLeft === "number"
                      ? ` — ${cert.daysLeft} day${cert.daysLeft === 1 ? "" : "s"} left`
                      : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--muted)" }}>Being served</dt>
                <dd style={{ color: serving ? undefined : "var(--warning)" }}>
                  {serving ? "yes" : "not until you restart"}
                </dd>
              </div>
            </dl>

            {cert.altNames && cert.altNames.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-sm" style={{ color: "var(--muted)" }}>
                  Valid for these addresses — reaching the dashboard by anything else will warn, even
                  once the certificate is trusted:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cert.altNames.map((n) => (
                    <span
                      key={n}
                      className="rounded px-2 py-0.5 font-mono text-xs"
                      style={{ background: "var(--surface-2)" }}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {cert.expired && (
              <div
                className="mt-4 rounded-xl border p-3 text-sm"
                style={{
                  borderColor: "var(--danger)",
                  background: "color-mix(in srgb, var(--danger) 8%, transparent)",
                }}
              >
                <strong>This certificate has expired.</strong> Browsers will refuse the connection
                rather than warn about it. Replace it below.
              </div>
            )}
            {cert.notYetValid && (
              <p className="mt-4 text-sm" style={{ color: "var(--warning)" }}>
                This certificate isn&apos;t valid yet — check this machine&apos;s clock.
              </p>
            )}
          </>
        )}
      </section>

      {config.mode === "selfsigned" && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">Generate a self-signed certificate</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Encrypts the connection without anyone else vouching for it, so every browser shows a
            warning the first time and you tell it to proceed. Right for a home network; not for
            anything on the public internet, where Let&apos;s Encrypt is free and trusted.
          </p>
          <form action={generate} className="flex flex-wrap items-end gap-3">
            <div className="min-w-40">
              <label className="label" htmlFor="selfSignedDays">
                Valid for
              </label>
              <select
                id="selfSignedDays"
                name="selfSignedDays"
                defaultValue={String(config.selfSignedDays)}
                className="input"
              >
                {VALIDITY.map((v) => (
                  <option key={v.days} value={v.days}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={generating}>
              {generating ? "Creating…" : cert ? "Replace certificate" : "Create certificate"}
            </button>
          </form>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Nothing changes until you restart. A longer life means fewer interruptions; a shorter one
            limits the damage if the key is ever copied off this machine. Nothing renews it
            automatically.
          </p>
          <Outcome state={genState} />
        </section>
      )}

      {config.mode === "byo" && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">Import your certificate</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Both files in PEM format. The certificate should be the <strong>full chain</strong> — your
            certificate followed by any intermediates — or some clients will reject it even though
            your browser accepts it.
          </p>
          <form action={importCert} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="certFile">
                  Certificate (fullchain.pem)
                </label>
                <input id="certFile" name="certFile" type="file" accept=".pem,.crt,.cer" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="keyFile">
                  Private key (privkey.pem)
                </label>
                <input id="keyFile" name="keyFile" type="file" accept=".pem,.key" className="input" />
              </div>
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={importing}>
                {importing ? "Checking…" : "Import certificate"}
              </button>
            </div>
          </form>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            The pair is checked before anything is stored — if the key doesn&apos;t belong to the
            certificate you&apos;ll be told now rather than at the next restart. Both are copied into
            JonDash&apos;s own data folder, so moving the originals afterwards is fine.
          </p>
          <Outcome state={impState} />
        </section>
      )}

      {config.mode === "letsencrypt" && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">Request a certificate</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Asks Let&apos;s Encrypt for a certificate for <strong>{config.domain || "your domain"}</strong>{" "}
            right now, rather than waiting for the next restart. Your domain must point at this
            machine and port {config.httpPort} must be reachable from the internet — that is how
            Let&apos;s Encrypt checks you own it.
          </p>
          {staging ? (
            <div
              className="mb-4 rounded-xl border p-3 text-sm"
              style={{
                borderColor: "var(--warning)",
                background: "color-mix(in srgb, var(--warning) 10%, transparent)",
              }}
            >
              <strong>Test mode is on.</strong> `ACME_STAGING=1` is set in your <code>.env</code>, so
              this asks Let&apos;s Encrypt&apos;s <em>staging</em> service. That proves the whole
              process works without touching your rate limits — but the certificate it returns is{" "}
              <strong>not trusted by browsers</strong>, so you will still see a warning. Remove the
              line and restart to get a real one.
            </div>
          ) : (
            <p className="mb-4 text-xs" style={{ color: "var(--muted)" }}>
              Getting this wrong a few times can use up Let&apos;s Encrypt&apos;s limit for your
              domain for the week. To rehearse it safely, put <code>ACME_STAGING=1</code> in your{" "}
              <code>.env</code> and restart — the process runs identically against their test service,
              and the certificate it hands back is deliberately untrusted.
            </p>
          )}
          <form action={request}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={requesting || !config.domain}
            >
              {requesting ? "Talking to Let's Encrypt…" : "Request certificate now"}
            </button>
          </form>
          {requesting && (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              This usually takes a few seconds. Leave this page open.
            </p>
          )}
          <Outcome state={reqState} />
        </section>
      )}
    </div>
  );
}
