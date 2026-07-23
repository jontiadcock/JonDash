"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AutoUpdateToggle } from "./auto-update-toggle";
import { updateModulesAction, checkModuleUpdatesAction, type ModuleUpdateState } from "./module-actions";
import { RestartWarning } from "../modules/restart-warning";
import { useRebuildWatch } from "../modules/rebuild-watch";

export type ModuleUpdateView = {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string | null;
  channel: string;
  sourceName: string;
  updateAvailable: boolean;
  blockedReason?: string;
  isDowngrade: boolean;
  permissionWarningsAdded: string[];
  permissionsRemovedCount: number;
  notes?: string;
  /** Opted in to automatic updates (BUG-30). */
  autoUpdate: boolean;
};

/**
 * Module updates, under the app's own update panel.
 *
 * The rule this UI enforces: **a module never changes without the user knowing.** There is
 * no auto-update path here at all — every change is an explicit click — and a version that
 * wants *more* access than was approved can't be applied until that's ticked separately.
 */
export function ModuleUpdatesPanel({ modules, errors }: { modules: ModuleUpdateView[]; errors: { source: string; message: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [consented, setConsented] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ModuleUpdateState, FormData>(updateModulesAction, {});
  const { overlay, start } = useRebuildWatch();

  const actionable = modules.filter((m) => m.updateAvailable);
  const chosen = actionable.filter((m) => selected.has(m.id));
  // A module wanting extra access is only selectable once that's been ticked.
  const needsConsent = chosen.filter((m) => m.permissionWarningsAdded.length > 0 && !consented.has(m.id));
  const blocked = modules.filter((m) => !m.updateAvailable && m.blockedReason);

  function toggle(id: string, set: typeof setSelected) {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {overlay}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Modules</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Updates for your installed modules. <strong>Modules are never updated automatically</strong> —
            even when JonDash updates itself — so nothing about them changes unless you choose it here.
          </p>
        </div>
        <form action={checkModuleUpdatesAction} className="flex-none">
          <button type="submit" className="btn btn-ghost !py-1.5 text-sm">Check now</button>
        </form>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
          {errors.map((e, i) => (
            <p key={i}><strong>{e.source}:</strong> {e.message}</p>
          ))}
        </div>
      )}

      {modules.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No modules are installed. <Link href="/admin/modules/browse" style={{ color: "var(--primary)" }}>Browse modules</Link> to add one.
        </p>
      ) : actionable.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          All {modules.length === 1 ? "your module is" : `${modules.length} modules are`} up to date.
          {blocked.length > 0 && " Some can't be updated yet — see below."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {actionable.map((m) => (
            <div key={m.id} className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id, setSelected)}
                  disabled={pending}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{m.name}</strong>
                    <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                      v{m.installedVersion} → v{m.latestVersion}
                    </span>
                    {m.channel === "beta" && (
                      <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>
                        beta
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                    from {m.sourceName}
                  </span>
                  {m.notes && <span className="mt-1 block text-sm">{m.notes}</span>}
                  {m.isDowngrade && (
                    <span className="mt-1 block text-sm" style={{ color: "var(--danger)" }}>
                      This goes <strong>backwards</strong> to an older version — it&apos;s what the{" "}
                      {m.channel} channel currently offers, not a newer release.
                    </span>
                  )}
                  {m.permissionsRemovedCount > 0 && (
                    <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
                      Gives up {m.permissionsRemovedCount} permission
                      {m.permissionsRemovedCount === 1 ? "" : "s"} it no longer needs.
                    </span>
                  )}
                </span>
              </label>

              {/* OUTSIDE the label on purpose: nested inside it, clicking this would also
                  toggle the row's selection checkbox. */}
              <div className="mt-2">
                <AutoUpdateToggle
                  kind="module"
                  id={m.id}
                  on={m.autoUpdate}
                  disabledReason={
                    m.permissionWarningsAdded.length > 0
                      ? "This version asks for more access — approve it yourself first."
                      : undefined
                  }
                />
              </div>

              {/* The one place an update is deliberately not one click. */}
              {m.permissionWarningsAdded.length > 0 && (
                <div
                  className="mt-2 rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}
                >
                  <p className="font-medium">This version asks for more access than you approved:</p>
                  <ul className="mt-1 flex flex-col gap-1 pl-5" style={{ listStyle: "disc" }}>
                    {m.permissionWarningsAdded.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={consented.has(m.id)}
                      onChange={() => toggle(m.id, setConsented)}
                      disabled={pending}
                    />
                    <span>I approve this extra access</span>
                  </label>
                </div>
              )}
            </div>
          ))}

          {chosen.length > 0 && (
            confirming && needsConsent.length === 0 ? (
              <form action={action} className="flex flex-col gap-3">
                {chosen.map((m) => <input key={m.id} type="hidden" name="moduleId" value={m.id} />)}
                {chosen.filter((m) => consented.has(m.id)).map((m) => (
                  <input key={m.id} type="hidden" name="consent" value={m.id} />
                ))}
                <RestartWarning what={`Update ${chosen.length} module${chosen.length === 1 ? "" : "s"}: ${chosen.map((m) => m.name).join(", ")}. Their stored data is kept.`} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" className="btn btn-primary !py-1.5 text-sm" disabled={pending} onClick={start}>
                    {pending ? "Updating and restarting…" : "Update and restart now"}
                  </button>
                  <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={pending} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary !py-1.5 text-sm"
                  onClick={() => setConfirming(true)}
                  disabled={needsConsent.length > 0}
                >
                  Update {chosen.length} selected
                </button>
                <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setSelected(new Set(actionable.map((m) => m.id)))}>
                  Select all
                </button>
                {needsConsent.length > 0 && (
                  <span className="text-sm" style={{ color: "var(--danger)" }}>
                    Approve the extra access above to continue.
                  </span>
                )}
              </div>
            )
          )}
        </div>
      )}

      {blocked.length > 0 && (
        <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--muted)" }}>
          {blocked.map((m) => (
            <p key={m.id}><strong>{m.name}</strong> — {m.blockedReason}</p>
          ))}
        </div>
      )}

      {state.error && <p className="text-sm" style={{ color: "var(--danger)" }}>{state.error}</p>}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        A newly published version can take a couple of minutes to appear — GitHub caches the list briefly.
      </p>
    </div>
  );
}
