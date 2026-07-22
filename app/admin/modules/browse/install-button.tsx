"use client";

import { createContext, useActionState, useContext, useEffect, useState, type ReactNode } from "react";
import { installModuleAction, type InstallState } from "../actions";
import { RestartWarning } from "../restart-warning";
import { useRebuildWatch } from "../rebuild-watch";

export type BrowseItem = {
  id: string;
  name: string;
  version: string;
  sourceId: string;
  installed: boolean;
  /** Helpers this module needs — installed alongside it, so named before you confirm. */
  helpers: string[];
};

/**
 * Selection state for Browse, shared through context.
 *
 * Context — NOT a render prop. The page listing the modules is a Server Component, and a
 * function cannot be passed across the server/client boundary ("Functions cannot be
 * passed directly to Client Components"), which crashed the page for anyone whose
 * channel actually had modules to list. Server-rendered elements pass through `children`
 * fine; only the interactive checkbox needs to be a client component.
 */
type Selection = {
  items: BrowseItem[];
  selected: Set<string>;
  toggle: (id: string) => void;
  pending: boolean;
};

const SelectionContext = createContext<Selection | null>(null);

/**
 * Wraps the module list and adds the batch-install bar. Modules are compiled into the
 * app, so every install costs a rebuild + restart — installing a selection as ONE batch
 * turns "click install, wait for a restart, repeat" into a single interruption.
 */
export function InstallPicker({
  items,
  channel,
  children,
}: {
  items: BrowseItem[];
  channel: string;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<InstallState, FormData>(installModuleAction, {});
  const { overlay, start, stop } = useRebuildWatch();

  // A successful install never returns — the process exits so the launcher can rebuild.
  // So an error coming back means nothing is restarting: drop the overlay and show it.
  useEffect(() => {
    if (state.error) stop();
  }, [state, stop]);

  const installable = items.filter((m) => !m.installed);
  const chosen = installable.filter((m) => selected.has(m.id));
  // Helpers are meant to arrive as one VISIBLE batch. Without naming them here the admin
  // approves a module and silently gets a helper too — true by luck today only because
  // the scheduler asks for no permissions.
  const helperNames = [...new Set(chosen.flatMap((m) => m.helpers))];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirming(false); // changing the selection invalidates a pending confirmation
  }

  return (
    <SelectionContext.Provider value={{ items, selected, toggle, pending }}>
      {overlay}
      <div className="flex flex-col gap-4">
        {children}

        {installable.length > 0 && (
          <div className="card flex flex-col gap-3 p-4">
            {chosen.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Select the modules you want, then install them together — one rebuild and one restart for the
                whole batch instead of one each.
              </p>
            ) : confirming ? (
              <form action={action} className="flex flex-col gap-3">
                <input type="hidden" name="channel" value={channel} />
                {chosen.map((m) => (
                  <input key={m.id} type="hidden" name="moduleId" value={m.id} />
                ))}
                <RestartWarning
                  what={
                    `Install ${chosen.length} module${chosen.length === 1 ? "" : "s"}: ` +
                    `${chosen.map((m) => m.name).join(", ")}.` +
                    (helperNames.length > 0
                      ? ` This also installs the ${helperNames.join(", ")} helper${
                          helperNames.length === 1 ? "" : "s"
                        }, which ${helperNames.length === 1 ? "it needs" : "they need"} to work.`
                      : "")
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary !py-1.5 text-sm"
                    disabled={pending}
                    onClick={start}
                  >
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
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary !py-1.5 text-sm"
                  onClick={() => setConfirming(true)}
                >
                  Install {chosen.length} selected
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !py-1.5 text-sm"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </button>
              </div>
            )}

            {state.error && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {state.error}
              </p>
            )}
          </div>
        )}
      </div>
    </SelectionContext.Provider>
  );
}

/** The per-module checkbox. Rendered inside a server-rendered card; reads shared state. */
export function SelectToggle({ id }: { id: string }) {
  const ctx = useContext(SelectionContext);
  const item = ctx?.items.find((m) => m.id === id);

  if (!ctx || !item || item.installed) {
    return (
      <span className="text-sm" style={{ color: "var(--muted)" }}>
        Installed
      </span>
    );
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={ctx.selected.has(id)}
        onChange={() => ctx.toggle(id)}
        disabled={ctx.pending}
        aria-label={`Select ${item.name} for installation`}
      />
      Select
    </label>
  );
}
