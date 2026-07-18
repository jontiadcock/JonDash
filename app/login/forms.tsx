"use client";

import { useActionState } from "react";
import { loginPasswordAction, loginTotpAction, type LoginState } from "./actions";

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

export function TotpForm() {
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
