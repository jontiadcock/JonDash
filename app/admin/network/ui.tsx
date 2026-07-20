"use client";

import { useActionState, useState } from "react";
import { saveNetworkConfigAction, type NetworkState } from "./actions";
import type { NetworkConfig } from "@/lib/tls/network";

const initial: NetworkState = {};

export function NetworkForm({ config }: { config: NetworkConfig }) {
  const [state, action, pending] = useActionState(saveNetworkConfigAction, initial);
  const [mode, setMode] = useState<NetworkConfig["mode"]>(config.mode);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <label className="label" htmlFor="mode">
          HTTPS mode
        </label>
        <select
          id="mode"
          name="mode"
          defaultValue={config.mode}
          onChange={(e) => setMode(e.target.value as NetworkConfig["mode"])}
          className="input"
        >
          <option value="off">Off — plain HTTP (default)</option>
          <option value="letsencrypt">Let&apos;s Encrypt — automatic certificate</option>
          <option value="byo">Bring your own certificate</option>
        </select>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {mode === "off" && "The dashboard is served over plain HTTP. Fine for a trusted LAN."}
          {mode === "letsencrypt" &&
            "A free certificate is obtained and auto-renewed from Let's Encrypt. Requires a public domain pointing at this machine and inbound port 80 reachable (HTTP-01 validation)."}
          {mode === "byo" &&
            "Serve a certificate you already have. Provide filesystem paths to the PEM files."}
        </p>
      </div>

      {mode !== "off" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="httpPort">
              HTTP port
            </label>
            <input
              id="httpPort"
              name="httpPort"
              type="number"
              min={1}
              max={65535}
              defaultValue={config.httpPort || 80}
              className="input"
            />
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Answers the ACME challenge and redirects to HTTPS. Let&apos;s Encrypt validates on
              port 80.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="httpsPort">
              HTTPS port
            </label>
            <input
              id="httpsPort"
              name="httpsPort"
              type="number"
              min={1}
              max={65535}
              defaultValue={config.httpsPort || 443}
              className="input"
            />
          </div>
        </div>
      )}

      {mode === "off" && (
        <div className="sm:max-w-xs">
          <label className="label" htmlFor="httpPortOff">
            HTTP port
          </label>
          <input
            id="httpPortOff"
            name="httpPort"
            type="number"
            min={1}
            max={65535}
            defaultValue={config.httpPort || 3000}
            className="input"
          />
        </div>
      )}

      {mode === "letsencrypt" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="domain">
              Domain
            </label>
            <input
              id="domain"
              name="domain"
              defaultValue={config.domain}
              placeholder="dash.example.com"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Contact email <span style={{ color: "var(--muted)" }}>(optional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={config.email}
              placeholder="you@example.com"
              className="input"
            />
          </div>
        </div>
      )}

      {mode === "byo" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="certPath">
              Certificate file (fullchain PEM)
            </label>
            <input
              id="certPath"
              name="certPath"
              defaultValue={config.certPath}
              placeholder="C:\\certs\\fullchain.pem"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="keyPath">
              Private key file (PEM)
            </label>
            <input
              id="keyPath"
              name="keyPath"
              defaultValue={config.keyPath}
              placeholder="C:\\certs\\privkey.pem"
              className="input"
            />
          </div>
        </div>
      )}

      <div
        className="rounded-lg px-4 py-3 text-sm"
        style={{ background: "var(--surface-2)", color: "var(--muted)" }}
      >
        Changes take effect after the dashboard is restarted. Restarting signs everyone out.
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save network settings"}
        </button>
        {state.ok && (
          <span className="text-sm" style={{ color: "var(--primary)" }}>
            Saved — restart to apply.
          </span>
        )}
        {state.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
