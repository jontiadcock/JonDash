"use client";

import { useActionState, useEffect, useState } from "react";
import { installModuleAction, type InstallState } from "../../actions";
import { RestartWarning } from "../../restart-warning";
import { useRebuildWatch } from "../../rebuild-watch";
import { useInstallQueue, toggleQueued } from "../install-queue";

/**
 * Queue it, or install it now — the two ways a module gets in, and both live only here (8.3).
 *
 * **Queue** adds it to a batch installed together from the catalogue page. A module's code is
 * compiled into the app, so each install costs a rebuild and a restart, and a restart signs
 * everyone out; batching turns three of those into one.
 *
 * **Install now** is for when it is the only one you want, and skips the round trip back.
 *
 * Both are on the module's own page rather than on a catalogue row, which is what guarantees the
 * permissions were on screen before either was pressed.
 * REFS app/admin/modules/browse/module-detail.tsx
 */
export function ModuleActions({
  id,
  name,
  channel,
  installed,
  installedVersion,
  tooOld,
  helpers,
}: {
  id: string;
  name: string;
  channel: string;
  installed: boolean;
  installedVersion: string | null;
  tooOld: boolean;
  helpers: string[];
}) {
  const queued = useInstallQueue().includes(id);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<InstallState, FormData>(installModuleAction, {});
  const { overlay, start, stop } = useRebuildWatch();

  // A successful install never returns — the process exits so the launcher can rebuild. An error
  // coming back therefore means nothing is restarting: drop the overlay and show it.
  useEffect(() => {
    if (state.error) stop();
  }, [state, stop]);

  if (installed) {
    return (
      <span className="flex-none text-sm" style={{ color: "var(--muted)" }}>
        Installed{installedVersion ? ` (v${installedVersion})` : ""}
      </span>
    );
  }

  if (tooOld) {
    // Deliberately not a disabled button: there is nothing to press *yet*, and the banner on the
    // page says what to do about it. A dead control invites the click that teaches you it is dead.
    return (
      <span className="flex-none text-sm" style={{ color: "var(--warning)" }}>
        Needs a newer JonDash
      </span>
    );
  }

  return (
    <div className="flex flex-none flex-col items-end gap-2">
      {overlay}
      {confirming ? (
        <form action={action} className="flex flex-col items-end gap-2">
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="moduleId" value={id} />
          <RestartWarning
            what={
              `Install ${name}.` +
              (helpers.length > 0
                ? ` This also installs the ${helpers.join(", ")} shared capabilit${
                    helpers.length === 1 ? "y" : "ies"
                  }, which it needs to work.`
                : "")
            }
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary !py-1.5 text-sm" disabled={pending} onClick={start}>
              {pending ? "Installing and restarting…" : "Install and restart now"}
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-1.5 text-sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleQueued(id)}
            className={queued ? "btn btn-primary !py-1.5 text-sm" : "btn btn-ghost !py-1.5 text-sm"}
            aria-pressed={queued}
          >
            {queued ? "Queued ✓" : "Queue install"}
          </button>
          <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setConfirming(true)}>
            Install now
          </button>
        </div>
      )}

      {queued && !confirming && (
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Install the batch from Browse modules.
        </span>
      )}

      {state.error && (
        <p className="max-w-xs text-sm" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
