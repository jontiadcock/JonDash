"use client";

import { useActionState, useState } from "react";
import {
  saveEmailConfigAction,
  sendTestEmailAction,
  disconnectOAuthAction,
  type EmailState,
} from "./actions";
import { PROVIDER_PRESETS } from "@/lib/email/constants";

type ConfigView = {
  enabled: boolean;
  mode: "password" | "oauth2";
  fromName: string;
  fromAddress: string;
  user: string;
  host: string;
  port: number;
  secure: boolean;
  provider: "google" | "microsoft" | "";
  oauthClientId: string;
  hasPassword: boolean;
  hasClientSecret: boolean;
  oauthConnected: boolean;
};

const initial: EmailState = {};

export function EmailSettings({
  config,
  redirectUri,
  adminEmail,
}: {
  config: ConfigView;
  redirectUri: string;
  adminEmail: string;
}) {
  const [state, action, pending] = useActionState(saveEmailConfigAction, initial);
  const [mode, setMode] = useState(config.mode);
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(String(config.port));
  const [secure, setSecure] = useState(config.secure);
  const [provider, setProvider] = useState<ConfigView["provider"]>(config.provider);

  function applyPreset(key: string) {
    const p = PROVIDER_PRESETS[key];
    if (!p) return;
    setHost(p.host);
    setPort(String(p.port));
    setSecure(p.secure);
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="flex flex-col gap-5">
        <label className="flex items-center gap-3">
          <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="h-4 w-4" />
          <span className="text-sm font-medium">Enable outgoing email</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="mode">Authentication</label>
            <select
              id="mode"
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as ConfigView["mode"])}
              className="input"
            >
              <option value="password">SMTP username + app password</option>
              <option value="oauth2">OAuth2 (Google / Microsoft)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="user">Account email address</label>
            <input id="user" name="user" type="email" defaultValue={config.user} placeholder="you@example.com" className="input" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fromName">From name</label>
            <input id="fromName" name="fromName" defaultValue={config.fromName} placeholder="JonDash" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="fromAddress">
              From address <span style={{ color: "var(--muted)" }}>(defaults to the account)</span>
            </label>
            <input id="fromAddress" name="fromAddress" type="email" defaultValue={config.fromAddress} placeholder="you@example.com" className="input" />
          </div>
        </div>

        {/* Password mode — always rendered (hidden when inactive) so values round-trip. */}
        <div style={{ display: mode === "password" ? undefined : "none" }} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="preset">Provider preset</label>
            <select id="preset" defaultValue="" onChange={(e) => applyPreset(e.target.value)} className="input">
              <option value="">Choose to auto-fill host/port…</option>
              {Object.entries(PROVIDER_PRESETS).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Gmail and Outlook/Hotmail require an <strong>app password</strong> (create one in your
              account&apos;s security settings; needs 2-step verification enabled).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="host">SMTP host</label>
              <input id="host" name="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="port">Port</label>
              <input id="port" name="port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} className="input" />
            </div>
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" name="secure" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm">Use TLS on connect (port 465). Leave off for STARTTLS (port 587).</span>
          </label>
          <div>
            <label className="label" htmlFor="password">App password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder={config.hasPassword ? "•••••••• (unchanged — type to replace)" : "app password"}
              className="input"
            />
          </div>
        </div>

        {/* OAuth2 mode — always rendered (hidden when inactive). */}
        <div style={{ display: mode === "oauth2" ? undefined : "none" }} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="provider">Provider</label>
            <select id="provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value as ConfigView["provider"])} className="input">
              <option value="">Choose…</option>
              <option value="google">Google</option>
              <option value="microsoft">Microsoft</option>
            </select>
          </div>
          <div
            className="rounded-lg p-3 text-sm"
            style={{ background: "var(--surface-2)" }}
          >
            <p className="mb-2 font-medium">Register this redirect URI in your OAuth app:</p>
            <CopyField value={redirectUri} />
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Create an OAuth client in the Google Cloud Console (scope <code>https://mail.google.com/</code>)
              or Microsoft Entra (scope <code>SMTP.Send</code> + <code>offline_access</code>), then paste
              its client ID and secret below and Save before connecting.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="oauthClientId">Client ID</label>
              <input id="oauthClientId" name="oauthClientId" defaultValue={config.oauthClientId} className="input font-mono text-xs" />
            </div>
            <div>
              <label className="label" htmlFor="oauthClientSecret">Client secret</label>
              <input
                id="oauthClientSecret"
                name="oauthClientSecret"
                type="password"
                autoComplete="new-password"
                placeholder={config.hasClientSecret ? "•••••••• (unchanged — type to replace)" : "client secret"}
                className="input"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {config.oauthConnected ? (
              <span className="text-sm" style={{ color: "var(--primary)" }}>✓ Connected</span>
            ) : (
              <span className="text-sm" style={{ color: "var(--muted)" }}>Not connected</span>
            )}
            <a href="/admin/email/oauth" className="btn btn-ghost !py-1.5 text-sm">
              {config.oauthConnected ? "Reconnect" : "Connect"}
            </a>
            {config.oauthConnected && (
              <form action={disconnectOAuthAction}>
                <button type="submit" className="btn btn-ghost !py-1.5 text-sm">Disconnect</button>
              </form>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Save your client ID and secret first, then Connect to authorize sending.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save email settings"}
          </button>
          {state.ok && <span className="text-sm" style={{ color: "var(--primary)" }}>Saved.</span>}
          {state.error && <span className="form-error">{state.error}</span>}
        </div>
      </form>

      <div className="border-t pt-6" style={{ borderColor: "var(--border)" }}>
        <TestEmailForm defaultTo={adminEmail} />
      </div>
    </div>
  );
}

function TestEmailForm({ defaultTo }: { defaultTo: string }) {
  const [state, action, pending] = useActionState(sendTestEmailAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label" htmlFor="test-to">Send a test email to</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input id="test-to" name="to" type="email" defaultValue={defaultTo} className="input sm:max-w-xs" />
        <button type="submit" className="btn btn-ghost" disabled={pending}>
          {pending ? "Sending…" : "Send test email"}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Uses the saved settings above — Save any changes first.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.testResult && (
        <p className="text-sm" style={{ color: state.testOk ? "var(--primary)" : "var(--destructive, #dc2626)" }}>
          {state.testResult}
        </p>
      )}
    </form>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input font-mono text-xs" />
      <button
        type="button"
        className="btn btn-ghost text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard may be unavailable */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
