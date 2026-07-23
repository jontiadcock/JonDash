"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateHelpersAction,
  updateEverythingAction,
  type HelperUpdateState,
} from "./helper-actions";
import { RestartWarning } from "../modules/restart-warning";
import { useRebuildWatch } from "../modules/rebuild-watch";

export type HelperUpdateView = {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string | null;
  channel: string;
  pinned: boolean;
  dependents: string[];
  updateAvailable: boolean;
  blockedReason?: string;
  isDowngrade: boolean;
  breaksModules: string[];
  notes?: string;
  /** Opted in to automatic updates (BUG-30). */
  autoUpdate: boolean;
};

/**
 * Helpers on the Updates page (MOD-10).
 *
 * A helper is not something the admin chose to install — it arrived with a module — so
 * this leads with WHY it's here (its dependants) rather than treating it as a product in
 * its own right. Everything else mirrors the module panel: batch, one restart.
 */
export function HelperUpdatesPanel({
  helpers,
  errors,
  anythingToUpdate,
}: {
  helpers: HelperUpdateView[];
  errors: { source: string; message: string }[];
  anythingToUpdate: boolean;
}) {
  const [state, action, pending] = useActionState<HelperUpdateState, FormData>(updateHelpersAction, {});
  const [everyState, everyAction, everyPending] = useActionState<HelperUpdateState, FormData>(
    updateEverythingAction,
    {},
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { overlay, start, stop } = useRebuildWatch();

  // A successful update never returns (the process exits to rebuild), so an error coming
  // back means nothing is restarting — drop the cover and show what went wrong.
  useEffect(() => {
    if (state.error || everyState.error) stop();
  }, [state, everyState, stop]);

  const updatable = helpers.filter((h) => h.updateAvailable && !h.blockedReason && !h.isDowngrade);
  const chosen = updatable.filter((h) => selected.has(h.id));
  // A helper that breaks its consumers needs the admin to accept that specific
  // consequence — never rolled into a general "yes".
  const breaking = chosen.filter((h) => h.breaksModules.length > 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {overlay}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Helpers</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Shared components your modules rely on. They arrive with the module that needs them — these are
            here so a fix can reach you without waiting for that module to change.
          </p>
        </div>
        {anythingToUpdate && (
          <form action={everyAction} className="flex-none">
            <button
              type="submit"
              className="btn btn-primary !py-1.5 text-sm"
              disabled={everyPending || pending}
              onClick={start}
            >
              {everyPending ? "Updating everything…" : "Update everything"}
            </button>
          </form>
        )}
      </div>

      {anythingToUpdate && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          <strong>Update everything</strong> covers your modules and helpers in one restart. It skips
          anything needing a decision — a module asking for more access, or a helper that would stop a
          module working — and tells you what it skipped. JonDash&apos;s own update stays separate above.
        </p>
      )}

      {errors.length > 0 &&
        errors.map((e, i) => (
          <p key={i} className="text-sm" style={{ color: "var(--danger)" }}>
            <strong>{e.source}:</strong> {e.message}
          </p>
        ))}

      {helpers.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No helpers are installed. They arrive automatically with a module that needs one.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          {helpers.map((h) => {
            const canUpdate = h.updateAvailable && !h.blockedReason && !h.isDowngrade;
            return (
              <div
                key={h.id}
                className="flex flex-wrap items-start gap-3 rounded-lg p-3"
                style={{ background: "var(--surface-2)" }}
              >
                {canUpdate && (
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(h.id)}
                    onChange={() => toggle(h.id)}
                    aria-label={`Update ${h.name}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{h.name}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                      v{h.installedVersion}
                      {h.latestVersion && h.latestVersion !== h.installedVersion ? ` → v${h.latestVersion}` : ""}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {h.channel}
                      {h.pinned ? " (pinned)" : ""}
                    </span>
                  </div>

                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    {h.dependents.length > 0
                      ? `Needed by ${h.dependents.join(", ")}`
                      : "Nothing depends on it any more — it will be removed on the next change."}
                  </p>

                  {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}

                  {h.breaksModules.length > 0 && (
                    <p className="mt-1 text-sm" style={{ color: "var(--danger)" }}>
                      ⚠ This version stops <strong>{h.breaksModules.join(", ")}</strong> working until those
                      modules are updated too.
                    </p>
                  )}
                  {h.blockedReason && (
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{h.blockedReason}</p>
                  )}
                  {!h.updateAvailable && !h.blockedReason && (
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Up to date.</p>
                  )}
                </div>

                {selected.has(h.id) && <input type="hidden" name="helperId" value={h.id} />}
              </div>
            );
          })}

          {chosen.length > 0 && (
            <>
              {breaking.map((h) => (
                <label key={h.id} className="flex items-start gap-2 text-sm" style={{ color: "var(--danger)" }}>
                  <input type="checkbox" name="acknowledgeBreaking" value={h.id} className="mt-1" required />
                  <span>
                    I understand updating <strong>{h.name}</strong> stops {h.breaksModules.join(", ")} working
                    until updated.
                  </span>
                </label>
              ))}
              <RestartWarning what={`Update ${chosen.length} helper${chosen.length === 1 ? "" : "s"}.`} />
              <div>
                <button
                  type="submit"
                  className="btn btn-ghost !py-1.5 text-sm"
                  disabled={pending || everyPending}
                  onClick={start}
                >
                  {pending ? "Updating…" : `Update ${chosen.length} helper${chosen.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {(state.error || everyState.error) && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {state.error ?? everyState.error}
        </p>
      )}
    </div>
  );
}
