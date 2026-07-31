"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateSelectedAction,
  checkAllUpdatesAction,
  queueAddonUpdatesAction,
  type SelectionState,
} from "./selection-actions";
import { RestartWarning } from "../modules/restart-warning";
import { useRebuildWatch } from "../modules/rebuild-watch";

/** REFS ./page.tsx — builds the list · ./selection-actions.ts › updateSelectedAction() */
export type AvailableItem = {
  kind: "core" | "module" | "helper";
  id: string;
  name: string;
  from: string;
  to: string;
  /** Only shown when the source declares one — add-on manifests may not. */
  criticality?: string;
  /** Selectable? A blocked or consent-needing update is listed but not tickable. */
  blockedReason?: string;
  /** Extra access this version wants; must be approved before it can be selected. */
  permissionWarnings?: string[];
  breaksModules?: string[];
};

const GROUPS = [
  { kind: "core" as const, label: "Core" },
  { kind: "module" as const, label: "Modules" },
  { kind: "helper" as const, label: "Helpers" },
];

const CRIT_COLOUR: Record<string, string> = {
  critical: "var(--danger, #dc2626)",
  important: "var(--warning, #b45309)",
};

/**
 * Everything with an update available, in one list grouped Core / Modules / Helpers — "what can I
 * update?" used to be answered in two panels that had to be read together.
 *
 * ⚠ Core and add-ons cannot be applied in one pass: core's update goes to the launcher and
 * replaces the process running the click. They are CHAINED instead — add-ons to a queue, core
 * updates and restarts, the post-update screen drains the queue.
 * ⚠ Core goes FIRST: a module's new version may require the newer JonDash, never the reverse.
 * REFS lib/update-queue.ts — the queue · app/(app)/update-complete/continue-addons.tsx — stage two
 *      ./selection-actions.ts › updateSelectedAction() · app/api/update/apply/route.ts
 */
export function AvailableUpdates({
  items,
  errors,
}: {
  items: AvailableItem[];
  errors: { source: string; message: string }[];
}) {
  // ⚠ A plain fetch, not a server action, and triggered from HERE rather than passed in: a
  // function prop cannot cross the server/client boundary — it builds cleanly, then 500s.
  const [coreError, setCoreError] = useState<string | null>(null);
  async function applyCore() {
    setCoreError(null);
    /*
     * ⚠ Cover the page BEFORE the request. Updating JonDash replaces the build, so the JS this
     * page is running disappears with it — without the overlay to notice the restart and reload,
     * the browser keeps calling Server Action ids that no longer exist and the page looks hung.
     * REFS app/components/server-wait-overlay.tsx
     */
    start("updating");
    try {
      const res = await fetch("/api/update/apply", { method: "POST" });
      if (!res.ok) {
        stop();
        setCoreError(`Update failed (${res.status}).`);
      }
    } catch {
      // A dropped connection here is expected — the server is going down to rebuild — so
      // the overlay stays up and waits for the new one rather than reporting an error.
    }
  }

  /*
   * ⚠ Store DESELECTED, not selected. Storing inclusions leaves anything newly discovered by
   * "Check now" silently excluded from a button that says "Update selected"; storing exclusions
   * means a new row arrives ticked while one you deliberately unticked stays unticked.
   * The old version also treated an empty set as "act on everything", so N unticked boxes sat
   * above a button that would update all N.
   */
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [consented, setConsented] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<SelectionState, FormData>(updateSelectedAction, {});
  const { overlay, start, stop } = useRebuildWatch();

  useEffect(() => {
    if (state.error) stop();
  }, [state, stop]);

  const key = (it: AvailableItem) => `${it.kind}:${it.id}`;
  const selectable = items.filter(
    (it) => !it.blockedReason && (!it.permissionWarnings?.length || consented.has(key(it))),
  );

  function toggle(it: AvailableItem) {
    setDeselected((prev) => {
      const next = new Set(prev);
      const k = key(it);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const isTicked = (it: AvailableItem) => !deselected.has(key(it));

  // ⚠ The selection IS what happens — never fall back to "empty means everything". The boxes and
  // the button must always agree.
  const effective = selectable.filter(isTicked);
  const coreChosen = effective.some((it) => it.kind === "core");
  const addons = effective.filter((it) => it.kind !== "core");
  // Core AND add-ons: run as one chained job — JonDash first, then the add-ons after it
  // restarts (a module's new version may need the newer JonDash, never the reverse).
  const chained = coreChosen && addons.length > 0;
  const label = `Update selected (${effective.length})`;
  const nothingChosen = effective.length === 0;

  /** Start the chained run: write down the add-ons, then apply core. */
  async function applyAll() {
    setCoreError(null);
    try {
      await queueAddonUpdatesAction(
        addons.filter((it) => it.kind === "module").map((it) => it.id),
        addons.filter((it) => it.kind === "helper").map((it) => it.id),
        addons.filter((it) => consented.has(key(it))).map((it) => it.id),
      );
    } catch {
      setCoreError("Couldn't prepare the add-on updates. Try updating JonDash on its own.");
      return;
    }
    await applyCore();
  }

  const checkNow = (
    <form action={checkAllUpdatesAction}>
      <button type="submit" className="btn btn-ghost !py-1.5 text-sm">Check now</button>
    </form>
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {checkNow}
        {errors.map((e, i) => (
          <p key={i} className="text-sm" style={{ color: "var(--danger)" }}>
            <strong>{e.source}:</strong> {e.message}
          </p>
        ))}
        <p className="text-sm" style={{ color: "var(--muted)" }}>Everything is up to date.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {overlay}
      {checkNow}

      {errors.map((e, i) => (
        <p key={i} className="text-sm" style={{ color: "var(--danger)" }}>
          <strong>{e.source}:</strong> {e.message}
        </p>
      ))}

      {GROUPS.map((g) => {
        const rows = items.filter((it) => it.kind === g.kind);
        if (rows.length === 0) return null;
        return (
          <div key={g.kind} className="flex flex-col gap-2">
            <div
              className="font-mono text-xs uppercase"
              style={{ letterSpacing: "0.1em", color: "var(--muted)" }}
            >
              {g.label}
            </div>

            {rows.map((it) => {
              const k = key(it);
              const needsConsent = !!it.permissionWarnings?.length && !consented.has(k);
              const disabled = !!it.blockedReason || needsConsent;
              return (
                <div key={k} className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!disabled && isTicked(it)}
                      onChange={() => toggle(it)}
                      disabled={disabled || pending}
                      aria-label={`Update ${it.name}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong>{it.name}</strong>
                        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                          v{it.from} → v{it.to}
                        </span>
                        {it.criticality && (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs"
                            style={{ color: CRIT_COLOUR[it.criticality] ?? "var(--muted)" }}
                          >
                            {it.criticality}
                          </span>
                        )}
                      </span>
                      {it.blockedReason && (
                        <span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>
                          {it.blockedReason}
                        </span>
                      )}
                      {it.breaksModules?.length ? (
                        <span className="mt-1 block text-sm" style={{ color: "var(--danger)" }}>
                          ⚠ Stops {it.breaksModules.join(", ")} working until those are updated too.
                        </span>
                      ) : null}
                    </span>
                  </label>

                  {/* The one place an update is deliberately not one click. */}
                  {it.permissionWarnings?.length ? (
                    <div
                      className="mt-2 rounded-lg border p-3 text-sm"
                      style={{
                        borderColor: "var(--danger)",
                        background: "color-mix(in srgb, var(--danger) 8%, transparent)",
                      }}
                    >
                      <p className="font-medium">This version asks for more access than you approved:</p>
                      <ul className="mt-1 flex flex-col gap-1 pl-5" style={{ listStyle: "disc" }}>
                        {it.permissionWarnings.map((w) => <li key={w}>{w}</li>)}
                      </ul>
                      <label className="mt-2 flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={consented.has(k)}
                          onChange={() =>
                            setConsented((prev) => {
                              const next = new Set(prev);
                              if (next.has(k)) next.delete(k);
                              else next.add(k);
                              return next;
                            })
                          }
                        />
                        <span>I approve this extra access</span>
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}

      {coreChosen ? (
        <div className="flex flex-col gap-2">
          <RestartWarning
            what={
              chained
                ? `Update JonDash, then ${addons.length} add-on${addons.length === 1 ? "" : "s"}: ${addons
                    .map((it) => it.name)
                    .join(", ")}.`
                : "Update JonDash itself. It restarts when it's done."
            }
          />
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={chained ? applyAll : applyCore}
              disabled={nothingChosen}
            >
              {chained ? label : "Update JonDash"}
            </button>
            {coreError && <span className="form-error ml-3">{coreError}</span>}
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {chained ? (
              <>
                JonDash updates first and restarts, then its add-ons are updated — they can need the
                newer JonDash, so the order matters. Both stages run on their own; stay on this page and
                it will tell you when everything is done.
              </>
            ) : (
              <>JonDash&apos;s own update restarts the app when it finishes.</>
            )}
          </p>
        </div>
      ) : selectable.length > 0 ? (
        /* Keyed on `selectable`, not `effective`: unticking the last row must leave a disabled
           button rather than making the whole control vanish, which reads as the page breaking. */
        <form action={action} className="flex flex-col gap-2">
          {effective.map((it) => (
            <input key={key(it)} type="hidden" name={it.kind === "helper" ? "helperId" : "moduleId"} value={it.id} />
          ))}
          {effective
            .filter((it) => consented.has(key(it)))
            .map((it) => <input key={`c-${key(it)}`} type="hidden" name="consent" value={it.id} />)}

          {effective.length > 0 && (
            <RestartWarning
              what={`Update ${effective.length} item${effective.length === 1 ? "" : "s"}: ${effective
                .map((it) => it.name)
                .join(", ")}. Their stored data is kept.`}
            />
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || nothingChosen}
              onClick={start}
            >
              {pending ? "Updating…" : label}
            </button>
            {nothingChosen && (
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Tick something to update.
              </span>
            )}
            {state.error && <span className="form-error">{state.error}</span>}
          </div>
        </form>
      ) : null}
    </div>
  );
}
