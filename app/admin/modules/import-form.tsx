"use client";

import { useActionState, useEffect, useState } from "react";
import { importModuleAction, type InstallState } from "./actions";
import { RestartWarning } from "./restart-warning";
import { useRebuildWatch } from "./rebuild-watch";

/**
 * Import your own module from a .zip — the sideload path, for a module you wrote (or had
 * an AI write) rather than one published by a source. It goes through exactly the same
 * verification as a source install: importing skips the source, not the checks.
 */
export function ImportModuleForm() {
  const [state, action, pending] = useActionState<InstallState, FormData>(importModuleAction, {});
  const [chosen, setChosen] = useState<string | null>(null);
  const { overlay, start, stop } = useRebuildWatch();

  // A successful import never returns (the process exits to rebuild), so an error coming
  // back means nothing is restarting — drop the cover and show what went wrong.
  useEffect(() => {
    if (state.error) stop();
  }, [state, stop]);

  return (
    <div className="card flex flex-col gap-3 p-5">
      {overlay}
      <div>
        <h2 className="font-medium">Import your own module</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          A <code>.zip</code> containing the module folder (with its <code>module.ts</code> inside). It is
          checked against the same safety rules as a module from a source — anything that reaches for a
          permission it didn&apos;t declare, touches the filesystem, or runs constructed code is refused.
          JonDash rebuilds and restarts afterwards.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="module-package">
            Module package <span style={{ color: "var(--muted)" }}>(.zip)</span>
          </label>
          <input
            id="module-package"
            type="file"
            name="package"
            accept=".zip,application/zip"
            required
            className="input"
            onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)}
          />
        </div>

        {/* The restart warning is the one thing that stays conditional — there's nothing to
            warn about until a file is chosen. The BUTTON is always rendered: hiding a card's
            primary action reads as a broken page, which is exactly how this was reported.
            Disabled says "not yet"; absent says "something is wrong here". */}
        {chosen && <RestartWarning what={`Check and install “${chosen}”.`} />}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="btn btn-ghost !py-1.5 text-sm"
            disabled={pending || !chosen}
            onClick={start}
          >
            {pending ? "Checking and restarting…" : "Import and restart now"}
          </button>
          {!chosen && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Choose a .zip file first.
            </span>
          )}
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
