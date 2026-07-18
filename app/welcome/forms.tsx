"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  welcomeCreateAction,
  welcomeConfirmAction,
  type WelcomeState,
} from "./actions";
import { BackupCodesPanel } from "@/app/components/backup-codes-panel";

const initial: WelcomeState = {};

export function WelcomeCreateForm() {
  const [state, action, pending] = useActionState(welcomeCreateAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="email">
          Your email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" placeholder="you@example.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Create a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="input"
          placeholder="At least 12 characters"
        />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          At least 12 characters, using three of: lowercase, uppercase, numbers, symbols.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className="input" />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}

export function WelcomeConfirmForm({
  qrDataUrl,
  secret,
}: {
  qrDataUrl: string;
  secret: string;
}) {
  const [state, action, pending] = useActionState(welcomeConfirmAction, initial);

  // Bootstrap succeeded — show the one-time recovery codes before the dashboard.
  if (state.backupCodes) {
    return (
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <p className="font-medium">You’re all set 🎉</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Save your recovery codes before continuing.
          </p>
        </div>
        <BackupCodesPanel codes={state.backupCodes} />
        <Link href="/dashboard" className="btn btn-primary text-center">
          I’ve saved them — go to my dashboard
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
        <p className="label mb-3">Set up two-factor authentication</p>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="TOTP QR code" width={132} height={132} className="rounded-lg bg-white p-1" />
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            <p>Scan with Google Authenticator, Authy, 1Password, etc.</p>
            <p className="mt-2">Or enter this key manually:</p>
            <code className="mt-1 block break-all font-mono text-[11px]">{secret}</code>
          </div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="code">
          Enter the 6-digit code to confirm
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="input tracking-[0.4em] text-center text-lg"
          placeholder="000000"
        />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Finishing…" : "Finish setup"}
      </button>
    </form>
  );
}
