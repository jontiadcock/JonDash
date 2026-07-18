"use client";

import { useActionState, useState } from "react";
import { regenerateBackupCodesAction, type RegenState } from "./actions";
import { BackupCodesPanel } from "@/app/components/backup-codes-panel";

const initial: RegenState = {};

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
