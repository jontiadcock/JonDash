"use client";

import { useActionState, useState } from "react";
import { SaveBar, selectSync, useFormDirty, useServerValue } from "@/app/components/save-bar";
import {
  saveEmailConfigAction,
  sendTestEmailAction,
  disconnectOAuthAction,
  type EmailState,
} from "./actions";

type ConfigView = {
  enabled: boolean;
  mode: "password" | "oauth2" | "relay";
  fromName: string;
  fromAddress: string;
  user: string;
  host: string;
  port: number;
  secure: boolean;
  allowUntrustedCert: boolean;
  provider: "google" | "microsoft" | "";
  oauthClientId: string;
  hasPassword: boolean;
  hasClientSecret: boolean;
  oauthConnected: boolean;
};

const initial: EmailState = {};

/** REFS app/admin/email/page.tsx */
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
  const { dirty, dirtyProps, generation } = useFormDirty(state);

  /*
   * `useServerValue`, not `useState` — these re-seed when the server's value changes.
   *
   * With plain `useState` each of these took its value once, at mount, and never again. After a
   * save revalidated, whatever the server came back with was ignored, so the screen could sit
   * there showing a mode that wasn't the stored one until you reloaded — which is exactly the
   * "needs a refresh" the owner reported for the relay setting.
   */
  const [mode, setMode] = useServerValue(config.mode);
  const [host, setHost] = useServerValue(config.host);
  const [port, setPort] = useServerValue(String(config.port));
  const [secure, setSecure] = useServerValue(config.secure);
  const [allowUntrusted, setAllowUntrusted] = useServerValue(config.allowUntrustedCert);
  const [provider, setProvider] = useServerValue<ConfigView["provider"]>(config.provider);
  const [enabled, setEnabled] = useServerValue(config.enabled);
  const [user, setUser] = useServerValue(config.user);
  const [fromName, setFromName] = useServerValue(config.fromName);
  const [fromAddress, setFromAddress] = useServerValue(config.fromAddress);
  const [clientId, setClientId] = useServerValue(config.oauthClientId);

  return (
    <div className="flex flex-col gap-8">
      <form action={action} {...dirtyProps} className="flex flex-col gap-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium">Enable outgoing email</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="mode">Authentication</label>
            <select
              id="mode"
              name="mode"
              value={mode}
              {...selectSync((v) => setMode(v as ConfigView["mode"]))}
              className="input"
            >
              <option value="password">SMTP username + app password</option>
              <option value="oauth2">OAuth2 (Google / Microsoft)</option>
              <option value="relay">Mail relay (no authentication)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="user">
              Account email address{" "}
              {mode === "relay" && <span style={{ color: "var(--muted)" }}>(not needed)</span>}
            </label>
            <input
              id="user"
              name="user"
              type="email"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="you@example.com"
              className="input"
            />
            {mode === "relay" && (
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                A relay has no account to sign in with. Leave this blank — set the{" "}
                <strong>From address</strong> below instead, which is what the relay will send as.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fromName">From name</label>
            <input
              id="fromName"
              name="fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="JonDash"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="fromAddress">
              From address <span style={{ color: "var(--muted)" }}>(defaults to the account)</span>
            </label>
            <input
              id="fromAddress"
              name="fromAddress"
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="you@example.com"
              className="input"
            />
          </div>
        </div>

        {/* SMTP details — used by BOTH password and relay mode. Always rendered (hidden
            when inactive) so values round-trip instead of being cleared on save. */}
        <div
          style={{ display: mode === "password" || mode === "relay" ? undefined : "none" }}
          className="flex flex-col gap-4"
        >
          {/* The provider preset dropdown was removed in 1.8.0 (owner: "it will just cause
              confusion"). It filled in a host and port you then had to understand anyway, and
              said nothing about the part people actually get stuck on — that Gmail and Outlook
              need an app password rather than your real one. The links at the foot of the page
              carry that instead, pointing at each provider's own instructions, which stay right
              when a provider changes its host. */}
          {mode === "relay" && (
            <div className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}>
              <p>
                JonDash will connect <strong>without offering any credentials</strong>. Use this for a
                relay that authorises by source IP — an internal smarthost, or Microsoft 365 direct
                send via an inbound connector.
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                Relays normally listen on <strong>port 25</strong> with the TLS box <strong>off</strong>
                {" "}(it still upgrades with STARTTLS when the server offers it).
              </p>
            </div>
          )}
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
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="allowUntrustedCert"
                checked={allowUntrusted}
                onChange={(e) => setAllowUntrusted(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">
                Accept this server&apos;s certificate even if it isn&apos;t trusted
              </span>
            </label>
            {allowUntrusted ? (
              <p
                className="mt-2 rounded-lg p-3 text-xs"
                style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}
              >
                <strong>Certificate checking is off for outgoing mail.</strong> JonDash can no longer
                prove it is talking to the right server, so anything able to intercept this connection
                could read your messages{" "}
                {mode === "password" && <>and the password sent with them</>}. Only leave this on for a
                relay you control on a network you trust — and prefer installing that relay&apos;s
                certificate authority on this machine instead.
              </p>
            ) : (
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Only needed for an internal relay using a private or self-signed certificate. Leave off
                for any public provider.
              </p>
            )}
          </div>
          <div style={{ display: mode === "password" ? undefined : "none" }}>
            {/* "Password", not "App password" (1.8.0). The old label described what Gmail and
                Outlook happen to call theirs, which is neither universal nor JonDash's business
                — a self-hosted relay just has a password. Which providers need a special one is
                said in the setup links at the foot of the page. */}
            <label className="label" htmlFor="password">Password</label>
            {/* Keyed on `generation` so it remounts empty once a save completes. It used to be
                cleared by React's post-action form reset, which is now cancelled — that reset
                was also snapping every other control back to its pre-save value. */}
            <input
              key={`password-${generation}`}
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder={config.hasPassword ? "•••••••• (unchanged — type to replace)" : "password"}
              className="input"
            />
            {/* This was already true and the screen never said so, which is why the owner asked
                for it to be made true. The whole email config is one encrypted Setting row. */}
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Stored encrypted, along with the rest of your mail settings. JonDash never shows it
              again — type a new one to replace it.
            </p>
          </div>
        </div>

        {/* OAuth2 mode — always rendered (hidden when inactive). */}
        <div style={{ display: mode === "oauth2" ? undefined : "none" }} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="provider">Provider</label>
            <select
              id="provider"
              name="provider"
              value={provider}
              {...selectSync((v) => setProvider(v as ConfigView["provider"]))}
              className="input"
            >
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
              <input
                id="oauthClientId"
                name="oauthClientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="input font-mono text-xs"
              />
            </div>
            <div>
              <label className="label" htmlFor="oauthClientSecret">Client secret</label>
              <input
                key={`client-secret-${generation}`}
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

        <SaveBar
          dirty={dirty}
          pending={pending}
          success={state.ok ? "Saved." : null}
          error={state.error}
          label="Save email settings"
        />
      </form>

      <div className="border-t pt-6" style={{ borderColor: "var(--border)" }}>
        <TestEmailForm defaultTo={adminEmail} />
      </div>

      {/*
        Replaces the provider preset (1.8.0). A preset filled in a host and port and said nothing
        about the part people actually get stuck on — that Gmail and Outlook want a purpose-made
        app password rather than your account password, and that Microsoft 365 disables SMTP AUTH
        per mailbox by default. Linking each provider's own instructions also survives them
        changing a hostname, which a hardcoded preset does not.
      */}
      <div className="border-t pt-6" style={{ borderColor: "var(--border)" }}>
        <h3 className="mb-1 text-sm font-semibold">Setting up a common provider</h3>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Each of these needs something specific of you before SMTP will work at all. Their own
          instructions stay current; anything JonDash copied here would not.
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <a
              href="https://support.google.com/accounts/answer/185833"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--primary)" }}
            >
              Gmail — create an app password
            </a>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {" "}— needs 2-step verification on first. Your normal password will not work.
            </span>
          </li>
          <li>
            <a
              href="https://support.microsoft.com/account-billing/using-app-passwords-with-apps-that-don-t-support-two-step-verification-5896ed9b-4263-e681-128a-a6f2979a7944"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--primary)" }}
            >
              Outlook.com / Hotmail — create an app password
            </a>
          </li>
          <li>
            <a
              href="https://learn.microsoft.com/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--primary)" }}
            >
              Microsoft 365 — enable SMTP AUTH
            </a>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {" "}— off by default per mailbox, which is the usual cause of a test that never
              connects.
            </span>
          </li>
          <li>
            <a
              href="https://learn.microsoft.com/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--primary)" }}
            >
              Microsoft 365 — direct send, no account needed
            </a>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {" "}— use <strong>Mail relay</strong> above for this.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function TestEmailForm({ defaultTo }: { defaultTo: string }) {
  const [state, action, pending] = useActionState(sendTestEmailAction, initial);
  // ⚠ Controlled, or React's post-action form reset snaps the recipient back to the admin's own
  // address — exactly when you want to retry the one that just failed.
  const [to, setTo] = useServerValue(defaultTo);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label" htmlFor="test-to">Send a test email to</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id="test-to"
          name="to"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="input sm:max-w-xs"
        />
        <button type="submit" className="btn btn-ghost" disabled={pending}>
          {pending ? "Sending…" : "Send test email"}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Uses the saved settings above — Save any changes first.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.testResult && (
        // ⚠ `pre-wrap` is load-bearing: an explanation is a raw error then what to do about it,
        // and HTML collapses that into one run-on line. REFS lib/email/send.ts › explainMailError()
        <p
          className="text-sm"
          style={{
            color: state.testOk ? "var(--primary)" : "var(--danger)",
            whiteSpace: "pre-wrap",
          }}
        >
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
