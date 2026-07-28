"use client";

import { useActionState, useEffect } from "react";
import { installModuleAction, type InstallState } from "../actions";
import { RestartWarning } from "../restart-warning";
import { useRebuildWatch } from "../rebuild-watch";
import { useInstallQueue, clearQueue, toggleQueued } from "./install-queue";

/**
 * The batch you have built up, and the one place it is installed from.
 *
 * A module's code is compiled into the app, so each install costs a rebuild and a restart — and a
 * restart signs everyone out. Queuing several and installing them together turns "install, wait
 * for a restart, repeat" into one interruption.
 *
 * **Nothing is queued from here.** Adding happens on a module's own page, where its permissions
 * are written out in full; this bar only shows what is waiting and installs it. That separation is
 * what stops a module being queued without its permissions having been read — the previous design
 * put a checkbox on every row of the catalogue, which allowed exactly that.
 *
 * Renders nothing at all when the queue is empty: a permanently-present empty bar is furniture.
 */
export function QueuedInstallBar({
  channel,
  names,
  installed,
}: {
  channel: string;
  /** Ids to display names, for the modules on this page. */
  names: Record<string, string>;
  /** Ids already installed — dropped from the queue on sight. See below. */
  installed: string[];
}) {
  const raw = useInstallQueue();

  /*
   * **Anything already installed is dropped from the queue.**
   *
   * A successful install never returns: the process exits so the launcher can rebuild, so nothing
   * on this page ever gets to run "the install worked, clear the queue". The ids therefore
   * survived in session storage across the restart, and the bar came back afterwards still
   * offering to install modules that were now installed — the owner, testing beta.17: *"after
   * queuing an install of 2 modules, the server restarted but the modules [were] still available
   * to install."*
   *
   * Filtering on what the server says is installed, rather than clearing the queue at submit
   * time, is deliberate: it self-heals whatever happened, and a failed install still leaves the
   * batch intact to retry. Clearing on submit would throw the batch away precisely when it was
   * most annoying to rebuild.
   */
  const done = new Set(installed);
  const queued = raw.filter((id) => !done.has(id));
  const [state, action, pending] = useActionState<InstallState, FormData>(installModuleAction, {});
  const { overlay, start, stop } = useRebuildWatch();

  // A successful install never returns — the process exits so the launcher can rebuild. So an
  // error coming back means nothing is restarting: drop the overlay and show what went wrong.
  useEffect(() => {
    if (state.error) stop();
  }, [state, stop]);

  if (queued.length === 0) return null;

  return (
    <div className="card flex flex-col gap-3 p-4">
      {overlay}
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="channel" value={channel} />
        {queued.map((id) => (
          <input key={id} type="hidden" name="moduleId" value={id} />
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {queued.length} queued to install
          </span>
          {queued.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs"
              style={{ background: "var(--surface-2)" }}
            >
              {/* A name only if this page knows it — the queue can outlive a channel switch, and
                  an id is honest where a wrong name would not be. */}
              {names[id] ?? id}
              <button
                type="button"
                onClick={() => toggleQueued(id)}
                aria-label={`Remove ${names[id] ?? id} from the queue`}
                style={{ color: "var(--muted)" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <RestartWarning
          what={`Install ${queued.length} module${queued.length === 1 ? "" : "s"}: ${queued
            .map((id) => names[id] ?? id)
            .join(", ")}.`}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary !py-1.5 text-sm" disabled={pending} onClick={start}>
            {pending ? "Installing and restarting…" : "Install and restart now"}
          </button>
          <button
            type="button"
            className="btn btn-ghost !py-1.5 text-sm"
            onClick={clearQueue}
            disabled={pending}
          >
            Clear
          </button>
        </div>
      </form>

      {state.error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
