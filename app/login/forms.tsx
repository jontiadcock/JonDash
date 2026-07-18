"use client";

import { useActionState, useState } from "react";
import {
  loginPasswordAction,
  loginTotpAction,
  loginBackupCodeAction,
  type LoginState,
} from "./actions";

const initial: LoginState = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(loginPasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••••••"
        />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

function TotpForm() {
  const [state, action, pending] = useActionState(loginTotpAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Enter the 6-digit code from your authenticator app.
      </p>
      <div>
        <label className="label" htmlFor="code">
          Authentication code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="input tracking-[0.5em] text-center text-lg"
          placeholder="000000"
        />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Verifying…" : "Sign in"}
      </button>
    </form>
  );
}

function BackupCodeForm() {
  const [state, action, pending] = useActionState(loginBackupCodeAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Enter one of your one-time recovery codes.
      </p>
      <div>
        <label className="label" htmlFor="code">
          Recovery code
        </label>
        <input
          id="code"
          name="code"
          autoComplete="one-time-code"
          required
          autoFocus
          className="input text-center font-mono tracking-widest"
          placeholder="XXXXX-XXXXX"
        />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Verifying…" : "Sign in"}
      </button>
    </form>
  );
}

/** Second-factor step: authenticator code, with a fallback to a recovery code. */
export function SecondFactorForm() {
  const [useBackup, setUseBackup] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {useBackup ? <BackupCodeForm /> : <TotpForm />}
      <button
        type="button"
        onClick={() => setUseBackup((v) => !v)}
        className="text-center text-xs underline"
        style={{ color: "var(--muted)" }}
      >
        {useBackup ? "Use your authenticator app instead" : "Can’t access your authenticator? Use a recovery code"}
      </button>
    </div>
  );
}
