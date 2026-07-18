"use client";

import { useActionState, useState } from "react";
import {
  regenerateBackupCodesAction,
  changePasswordAction,
  type RegenState,
  type ChangePwState,
} from "./actions";
import { BackupCodesPanel } from "@/app/components/backup-codes-panel";

const initial: RegenState = {};
const pwInitial: ChangePwState = {};

export function ChangePassword() {
  const [state, action, pending] = useActionState(changePasswordAction, pwInitial);
  const [open, setOpen] = useState(false);

  if (state.success) {
    return <p className="text-sm" style={{ color: "var(--primary)" }}>{state.success}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost !py-1.5 !px-3 text-sm self-start"
        onClick={() => setOpen(true)}
      >
        Change password
      </button>
    );
  }

  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} className="input" />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          At least 12 characters, using three of: lowercase, uppercase, numbers, symbols.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className="input" />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </button>
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RegenerateBackupCodes({ remaining, total }: { remaining: number; total: number }) {
  const [state, action, pending] = useActionState(regenerateBackupCodesAction, initial);
  const [open, setOpen] = useState(false);

  if (state.backupCodes) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: "var(--primary)" }}>
          New codes generated — your previous codes no longer work.
        </p>
        <BackupCodesPanel codes={state.backupCodes} />
      </div>
    );
  }

  const low = remaining <= 3;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span style={{ color: low ? "#d97706" : "var(--muted)" }}>
          {remaining} of {total} recovery codes remaining.
        </span>{" "}
        {low && "Consider regenerating a fresh set."}
      </p>

      {!open ? (
        <button
          type="button"
          className="btn btn-ghost !py-1.5 !px-3 text-sm self-start"
          onClick={() => setOpen(true)}
        >
          Regenerate recovery codes
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Regenerating invalidates all current codes. Enter your authenticator code to confirm.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="regen-code">
                Authenticator code
              </label>
              <input
                id="regen-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                className="input tracking-[0.3em] text-center"
                placeholder="000000"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Generating…" : "Generate new codes"}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
          {state.error && <p className="form-error">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
