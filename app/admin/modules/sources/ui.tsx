"use client";

import { useActionState, useState } from "react";
import {
  addSourceAction,
  removeSourceAction,
  toggleSourceAction,
  type SourceState,
} from "../actions";

export type SourceItem = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  isDefault: boolean;
};

export function SourcesManager({ items }: { items: SourceItem[] }) {
  const [state, action, pending] = useActionState<SourceState, FormData>(addSourceAction, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No sources. Add one below to browse modules.
          </p>
        ) : (
          items.map((s) => <SourceRow key={s.id} s={s} />)
        )}
      </div>

      <form action={action} className="flex flex-col gap-3 border-t pt-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <label className="label" htmlFor="src-url">Add a source</label>
          <input
            id="src-url"
            name="url"
            className="input"
            placeholder="https://github.com/owner/repo"
            autoComplete="off"
            required
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            The repository must publish an <code>addons.json</code> manifest. JonDash checks it before saving.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary self-start" disabled={pending}>
            {pending ? "Checking…" : "Add source"}
          </button>
          {state.ok && <span className="text-sm" style={{ color: "var(--primary)" }}>Source added.</span>}
          {state.error && <span className="form-error">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}

function SourceRow({ s }: { s: SourceItem }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{s.name}</span>
          {s.isDefault && (
            <span
              className="rounded px-1.5 py-0.5 text-xs font-medium"
              style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}
            >
              Official
            </span>
          )}
          {!s.enabled && (
            <span className="rounded px-1.5 py-0.5 text-xs" style={{ color: "var(--muted)" }}>Disabled</span>
          )}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs" style={{ color: "var(--muted)" }}>{s.url}</p>
      </div>

      <div className="flex flex-none items-center gap-2">
        <form action={toggleSourceAction}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="enabled" value={s.enabled ? "false" : "true"} />
          <button type="submit" className="btn btn-ghost !py-1.5 text-sm">
            {s.enabled ? "Disable" : "Enable"}
          </button>
        </form>

        {confirmRemove ? (
          <>
            <span className="text-sm">Remove?</span>
            <form action={removeSourceAction}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" className="btn btn-danger !py-1.5 text-sm">Confirm</button>
            </form>
            <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-ghost !py-1.5 text-sm"
            style={{ color: "var(--danger)" }}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
