"use client";

import { useState } from "react";
import { enableModuleAction, disableModuleAction, uninstallModuleAction } from "./actions";

export type ModuleItem = {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  /** Has a Module row — i.e. it has been set up and may be holding settings/data. */
  installed: boolean;
  hasSettings: boolean;
  hasPage: boolean;
  permissions: { key: string; warning: string; dangerous: boolean }[];
};

export function ModulesList({ items }: { items: ModuleItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No modules are installed. JonDash ships without any — use <strong>Browse modules</strong> above to
        see what a source publishes. Importing your own comes in a later update.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((m) => (
        <ModuleCard key={m.id} m={m} />
      ))}
    </div>
  );
}

function ModuleCard({ m }: { m: ModuleItem }) {
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.name}</span>
            <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>v{m.version}</span>
            <StateChip enabled={m.enabled} installed={m.installed} />
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{m.description}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {m.enabled ? (
            <>
              <a href={`/admin/modules/${m.id}`} className="btn btn-ghost !py-1.5 text-sm">
                {m.hasSettings ? "Settings" : "Channel"}
              </a>
              {m.hasPage && (
                <a href={`/m/${m.id}`} className="btn btn-ghost !py-1.5 text-sm">Open</a>
              )}
              <form action={disableModuleAction}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="btn btn-ghost !py-1.5 text-sm">Disable</button>
              </form>
            </>
          ) : (
            <form action={enableModuleAction}>
              <input type="hidden" name="id" value={m.id} />
              <button type="submit" className="btn btn-primary !py-1.5 text-sm">Enable</button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
        <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Permissions</p>
        {m.permissions.length === 0 ? (
          <p className="mt-1 text-sm">None beyond the basics (its own settings and its own data).</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {m.permissions.map((p) => (
              <li key={p.key} style={p.dangerous ? { color: "var(--danger)" } : undefined}>
                {p.dangerous ? "⚠ " : "• "}
                {p.warning}
              </li>
            ))}
          </ul>
        )}
        {!m.enabled && m.permissions.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Enabling the module grants these.</p>
        )}
      </div>

      {/* Only offered when there is actually something to remove. Once uninstalled the
          module drops back to "Not set up" and this disappears — so the click always has
          a visible effect. */}
      {m.installed && (
        <div className="flex flex-wrap items-center gap-2">
          {confirmUninstall ? (
            <>
              <span className="text-sm">
                Permanently delete this module, its settings and its stored data? JonDash will rebuild and
                restart, so everyone signed in will need to sign in again.
              </span>
              <form action={uninstallModuleAction}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="btn btn-danger !py-1.5 text-sm">Confirm uninstall</button>
              </form>
              <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setConfirmUninstall(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-ghost !py-1.5 text-sm"
              style={{ color: "var(--danger)" }}
              onClick={() => setConfirmUninstall(true)}
            >
              Uninstall
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Unambiguous lifecycle state, so enable/disable/uninstall each visibly change the card. */
function StateChip({ enabled, installed }: { enabled: boolean; installed: boolean }) {
  const { label, color } = enabled
    ? { label: "Enabled", color: "var(--primary)" }
    : installed
      ? { label: "Disabled", color: "var(--muted)" }
      : { label: "Not set up", color: "var(--muted)" };
  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {label}
    </span>
  );
}
