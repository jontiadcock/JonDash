"use client";

import { useActionState } from "react";
import {
  authorizeReenrollAction,
  confirmReenrollAction,
  type AuthorizeState,
  type ReenrollState,
} from "./actions";

const authorizeInitial: AuthorizeState = {};
const confirmInitial: ReenrollState = {};

export function ReenrollFlow() {
  const [authState, authorizeAction, authPending] = useActionState(
    authorizeReenrollAction,
    authorizeInitial,
  );

  // Step 2 begins once authorisation returns a new secret + QR.
  if (authState.qrDataUrl && authState.secret) {
    return <ConfirmForm qrDataUrl={authState.qrDataUrl} secret={authState.secret} />;
  }

  // Step 1 — authorise with the CURRENT authenticator (or a backup code).
  return (
    <form action={authorizeAction} className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        This replaces the authenticator app linked to your account. First, confirm it’s you.
        On the next step you’ll scan the new authenticator.
      </p>
      <div>
        <label className="label" htmlFor="authCode">
          Current authenticator code, or a backup code
        </label>
        <input
          id="authCode"
          name="authCode"
          autoComplete="one-time-code"
          required
          autoFocus
          className="input text-center font-mono"
          placeholder="Current 6-digit code, or a backup code"
        />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Enter a code from your <strong>current</strong> authenticator, or one of your backup
          codes if you no longer have it.
        </p>
      </div>
      {authState.error && <p className="form-error">{authState.error}</p>}
      <button type="submit" className="btn btn-primary self-start" disabled={authPending}>
        {authPending ? "Checking…" : "Next"}
      </button>
    </form>
  );
}

function ConfirmForm({ qrDataUrl, secret }: { qrDataUrl: string; secret: string }) {
  const [state, action, pending] = useActionState(confirmReenrollAction, confirmInitial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <p className="text-sm" style={{ color: "var(--primary)" }}>
        Identity confirmed. Now set up your new authenticator.
      </p>

      <div className="rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
        <p className="label mb-3">1 · Scan the new QR code</p>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="New TOTP QR code" width={132} height={132} className="rounded-lg bg-white p-1" />
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            <p>Add this to your authenticator app.</p>
            <p className="mt-2">Or enter this key manually:</p>
            <code className="mt-1 block break-all font-mono text-[11px]">{secret}</code>
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="newCode">2 · Code from your NEW authenticator</label>
        <input
          id="newCode"
          name="newCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="input tracking-[0.3em] text-center"
          placeholder="000000"
        />
      </div>

      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {pending ? "Saving…" : "Replace authenticator"}
      </button>
    </form>
  );
}
