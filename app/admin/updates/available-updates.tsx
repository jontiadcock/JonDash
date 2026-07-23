"use client";

import { useActionState, useEffect, useState } from "react";
import { updateSelectedAction, checkAllUpdatesAction, type SelectionState } from "./selection-actions";
import { RestartWarning } from "../modules/restart-warning";
import { useRebuildWatch } from "../modules/rebuild-watch";

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
 * Everything with an update available, in one list grouped Core / Modules / Helpers.
 *
 * Replaces the separate module and helper panels: the question "what can I update?" was
 * answered in two places that had to be read together.
 *
 * **Core is applied on its own.** JonDash's own update goes through the launcher
 * (`/api/update/apply`), while modules and helpers are applied in-process and exit to
 * rebuild. Running both from one click can half-apply, so selecting Core clears any add-on
 * selection and vice versa — stated in the UI rather than silently enforced.
 */
export function AvailableUpdates({
  items,
  errors,
}: {
  items: AvailableItem[];
  errors: { source: string; message: string }[];
}) {
  // Applying core is a plain fetch, not a server action, and it is triggered from HERE
  // rather than passed in: a function prop cannot cross the server/client boundary — it
  // typechecks and builds, then 500s at request time.
  const [coreError, setCoreError] = useState<string | null>(null);
  async function applyCore() {
    setCoreError(null);
    try {
      const res = await fetch("/api/update/apply", { method: "POST" });
      if (!res.ok) setCoreError(`Update failed (${res.status}).`);
    } catch {
      setCoreError("Could not reach the server to start the update.");
    }
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(it);
      if (next.has(k)) {
        next.delete(k);
        return next;
      }
      // Core and add-ons apply through different machinery — never both at once.
      if (it.kind === "core") next.clear();
      else for (const s of [...next]) if (s.startsWith("core:")) next.delete(s);
      next.add(k);
      return next;
    });
  }

  const chosen = selectable.filter((it) => selected.has(key(it)));
  const coreChosen = chosen.some((it) => it.kind === "core");
  // Nothing ticked = act on everything selectable, which is what "Update all" means.
  const effective = chosen.length > 0 ? chosen : selectable.filter((it) => it.kind !== "core");
  const label = chosen.length > 0 ? `Update selected (${chosen.length})` : "Update all";

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
                      checked={selected.has(k)}
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
          <RestartWarning what="Update JonDash itself. It restarts when it's done." />
          <div>
            <button type="button" className="btn btn-primary" onClick={applyCore}>
              Update JonDash
            </button>
            {coreError && <span className="form-error ml-3">{coreError}</span>}
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            JonDash&apos;s own update is applied on its own — it restarts differently from modules and
            helpers, so the two are never run from one click.
          </p>
        </div>
      ) : effective.length > 0 ? (
        <form action={action} className="flex flex-col gap-2">
          {effective.map((it) => (
            <input key={key(it)} type="hidden" name={it.kind === "helper" ? "helperId" : "moduleId"} value={it.id} />
          ))}
          {effective
            .filter((it) => consented.has(key(it)))
            .map((it) => <input key={`c-${key(it)}`} type="hidden" name="consent" value={it.id} />)}

          <RestartWarning
            what={`Update ${effective.length} item${effective.length === 1 ? "" : "s"}: ${effective
              .map((it) => it.name)
              .join(", ")}. Their stored data is kept.`}
          />
          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={pending} onClick={start}>
              {pending ? "Updating…" : label}
            </button>
            {state.error && <span className="form-error">{state.error}</span>}
          </div>
        </form>
      ) : null}
    </div>
  );
}
