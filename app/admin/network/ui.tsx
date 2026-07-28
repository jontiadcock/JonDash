"use client";

import { useActionState } from "react";
import { SaveBar, selectSync, useFormDirty, useServerValue } from "@/app/components/save-bar";
import { saveNetworkConfigAction, type NetworkState } from "./actions";
import type { NetworkConfig } from "@/lib/tls/network";

const initial: NetworkState = {};

export function NetworkForm({ config }: { config: NetworkConfig }) {
  const [state, action, pending] = useActionState(saveNetworkConfigAction, initial);
  const { dirty, dirtyProps } = useFormDirty(state);

  /*
   * Controlled and re-seeded from the server — see the note in app/components/save-bar.tsx.
   *
   * The mode select was worse than the rest: it had `defaultValue` AND an `onChange` feeding a
   * separate piece of state, so the DOM and the state that decides which fields to show were
   * two independent copies of the same answer.
   */
  const [mode, setMode] = useServerValue<NetworkConfig["mode"]>(config.mode);
  const [httpPort, setHttpPort] = useServerValue(String(config.httpPort || (config.mode === "off" ? 3000 : 80)));
  const [httpsPort, setHttpsPort] = useServerValue(String(config.httpsPort || 443));
  const [domain, setDomain] = useServerValue(config.domain);
  const [email, setEmail] = useServerValue(config.email);
  const [certPath, setCertPath] = useServerValue(config.certPath);
  const [keyPath, setKeyPath] = useServerValue(config.keyPath);

  return (
    <form action={action} {...dirtyProps} className="flex flex-col gap-5">
      <div>
        <label className="label" htmlFor="mode">
          HTTPS mode
        </label>
        <select
          id="mode"
          name="mode"
          value={mode}
          {...selectSync((v) => setMode(v as NetworkConfig["mode"]))}
          className="input"
        >
          <option value="off">Off — plain HTTP (default)</option>
          <option value="letsencrypt">Let&apos;s Encrypt — automatic certificate</option>
          <option value="selfsigned">Self-signed — encrypted, with a browser warning</option>
          <option value="byo">Bring your own certificate</option>
        </select>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {mode === "off" && "The dashboard is served over plain HTTP. Fine for a trusted LAN."}
          {mode === "letsencrypt" &&
            "A free certificate is obtained and auto-renewed from Let's Encrypt. Requires a public domain pointing at this machine and inbound port 80 reachable (HTTP-01 validation)."}
          {mode === "selfsigned" &&
            "JonDash makes its own certificate. The connection is encrypted, but no one vouches for it, so each browser warns once until you tell it to trust this site. No domain needed — it covers this machine's names and addresses."}
          {mode === "byo" &&
            "Serve a certificate you already have. Save this, then import the PEM files below."}
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
              value={httpPort}
              onChange={(e) => setHttpPort(e.target.value)}
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
              value={httpsPort}
              onChange={(e) => setHttpsPort(e.target.value)}
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
            value={httpPort}
            onChange={(e) => setHttpPort(e.target.value)}
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
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input"
            />
          </div>
        </div>
      )}

      {/*
        The old path fields, kept only for an install that is already using them.
        Importing (below the form) replaced typing a path in 1.8.0 — a path is a promise about a
        file JonDash doesn't control — but an install already serving from one must keep working
        across the update, and it can't do that if the fields vanish and take the values with them.
        Once a certificate is imported these are cleared and the block disappears for good.
      */}
      {mode === "byo" && (certPath || keyPath) && (
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            This install serves a certificate from a path on disk. That still works — but importing
            one below copies it into JonDash instead, so moving or replacing the original file can
            never quietly break HTTPS at the next restart.
          </p>
          <div>
            <label className="label" htmlFor="certPath">
              Certificate file (fullchain PEM)
            </label>
            <input
              id="certPath"
              name="certPath"
              value={certPath}
              onChange={(e) => setCertPath(e.target.value)}
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
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="C:\\certs\\privkey.pem"
              className="input"
            />
          </div>
        </div>
      )}

      {/* Carried so saving the form doesn't blank a stored value that isn't on screen. */}
      <input type="hidden" name="selfSignedDays" value={String(config.selfSignedDays)} />

      <div
        className="rounded-lg px-4 py-3 text-sm"
        style={{ background: "var(--surface-2)", color: "var(--muted)" }}
      >
        Changes take effect after the dashboard is restarted. You stay signed in across the restart.
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        success={state.ok ? "Saved — restart to apply." : null}
        error={state.error}
        label="Save network settings"
      />
    </form>
  );
}
