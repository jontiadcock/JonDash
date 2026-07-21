"use client";

import { useActionState } from "react";
import { installModuleAction, type InstallState } from "../actions";

/**
 * Install a module from a source. Installing rebuilds and restarts JonDash (a module's
 * code is compiled into the app), so the button states that plainly before it's clicked
 * and any verification failure is shown rather than silently doing nothing.
 */
export function InstallButton({
  sourceId,
  moduleId,
  channel,
  installed,
}: {
  sourceId: string;
  moduleId: string;
  channel: string;
  installed: boolean;
}) {
  const [state, action, pending] = useActionState<InstallState, FormData>(installModuleAction, {});

  if (installed) {
    return (
      <span className="text-sm" style={{ color: "var(--muted)" }}>
        Installed
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="moduleId" value={moduleId} />
        <input type="hidden" name="channel" value={channel} />
        <button type="submit" className="btn btn-primary !py-1.5 text-sm" disabled={pending}>
          {pending ? "Installing…" : "Install"}
        </button>
      </form>
      {state.error && (
        <p className="max-w-md text-right text-xs" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
