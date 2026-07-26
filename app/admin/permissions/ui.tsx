"use client";

import { useEffect, useState } from "react";
import {
  setModuleGrantAction,
  listScopeAction,
  editScopeAction,
  browseScopeAction,
  setItemToggleAction,
  unboundedStateAction,
  setUnboundedAction,
  setUnboundedOptionAction,
} from "./actions";
import type { ScopeItem, ScopeCandidate } from "@/lib/helpers/types";

/** Shapes mirrored from lib/permissions-view.ts — a server type can't cross as a prop. */
export type CapabilityInfo = {
  permission: string;
  label: string;
  risk: "low" | "medium" | "high";
  helper: { id: string; name: string } | null;
  hasScope: boolean;
};
export type ModuleRow = {
  moduleId: string;
  moduleName: string;
  enabled: boolean;
  declared: CapabilityInfo[];
  granted: string[];
};
export type CapabilityRow = {
  capability: CapabilityInfo;
  holders: { moduleId: string; moduleName: string; granted: boolean; enabled: boolean }[];
};

const RISK: Record<string, { label: string; colour: string }> = {
  high: { label: "High", colour: "var(--danger)" },
  medium: { label: "Medium", colour: "var(--warning)" },
  low: { label: "Low", colour: "var(--muted)" },
};

/**
 * Admin → Permissions (CORE-10).
 *
 * **Two axes over the same rows.** By module answers "what can this thing do"; by capability
 * answers "what can reach my files" — the one that catches trouble, and the one you cannot
 * reconstruct by clicking through modules one at a time.
 */
export function PermissionsView({ modules, capabilities }: { modules: ModuleRow[]; capabilities: CapabilityRow[] }) {
  const [axis, setAxis] = useState<"module" | "capability">("capability");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["capability", "module"] as const).map((a) => (
          <button
            key={a}
            type="button"
            className={`btn !py-1.5 text-sm ${axis === a ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setAxis(a)}
          >
            {a === "capability" ? "By capability" : "By module"}
          </button>
        ))}
      </div>

      {axis === "capability"
        ? capabilities.map((c) => <CapabilityCard key={c.capability.permission} row={c} />)
        : modules.map((m) => <ModuleCard key={m.moduleId} row={m} />)}

      {(axis === "capability" ? capabilities.length : modules.length) === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nothing installed asks for any capability yet.
        </p>
      )}
    </div>
  );
}

function RiskChip({ risk }: { risk: string }) {
  const r = RISK[risk] ?? RISK.low!;
  return (
    <span className="text-xs font-semibold" style={{ color: r.colour }}>
      {r.label} risk
    </span>
  );
}

function CapabilityCard({ row }: { row: CapabilityRow }) {
  const { capability: cap, holders } = row;
  const holding = holders.filter((h) => h.granted);

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{cap.label}</span>
        <RiskChip risk={cap.risk} />
        {/* The raw key, always. A friendly label is for reading; this is what is enforced. */}
        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{cap.permission}</span>
        {cap.helper && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>via {cap.helper.name}</span>
        )}
      </div>

      <p className="text-sm" style={{ color: holding.length > 0 ? "var(--foreground)" : "var(--muted)" }}>
        {holding.length === 0
          ? "No module currently holds this."
          : `${holding.length} of ${holders.length} module${holders.length === 1 ? " holds" : "s hold"} this.`}
      </p>

      <div className="flex flex-col gap-1.5">
        {holders.map((h) => (
          <GrantToggle
            key={h.moduleId}
            moduleId={h.moduleId}
            permission={cap.permission}
            label={h.moduleName}
            granted={h.granted}
            enabled={h.enabled}
          />
        ))}
      </div>

      {/* The set that BOUNDS this capability sits with the switch, never on another screen —
          a bound the admin has to go and find is the bug this page exists to prevent. */}
      {cap.hasScope && cap.helper && <ScopeEditor helperId={cap.helper.id} permission={cap.permission} />}
    </div>
  );
}

function ModuleCard({ row }: { row: ModuleRow }) {
  const held = new Set(row.granted);
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.moduleName}</span>
        {!row.enabled && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>disabled</span>
        )}
      </div>
      {row.declared.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Asks for nothing.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {row.declared.map((c) => (
            <GrantToggle
              key={c.permission}
              moduleId={row.moduleId}
              permission={c.permission}
              label={c.label}
              sub={c.permission}
              risk={c.risk}
              granted={held.has(c.permission)}
              enabled={row.enabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GrantToggle({
  moduleId,
  permission,
  label,
  sub,
  risk,
  granted,
  enabled,
}: {
  moduleId: string;
  permission: string;
  label: string;
  sub?: string;
  risk?: string;
  granted: boolean;
  enabled: boolean;
}) {
  const [on, setOn] = useState(granted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const want = !on;
    const res = await setModuleGrantAction(moduleId, permission, want);
    // Only move the switch once the server agrees. An optimistic toggle on a permissions
    // screen would show a capability as revoked while it was still held.
    if (res.ok) setOn(want);
    else setError(res.error ?? "Couldn't change that.");
    setBusy(false);
  }

  return (
    <div className="flex items-start gap-2.5">
      <input type="checkbox" checked={on} disabled={busy || !enabled} onChange={toggle} className="mt-1 flex-none" />
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-baseline gap-2 text-sm">
          {label}
          {risk && <RiskChip risk={risk} />}
        </span>
        {sub && <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{sub}</span>}
        {!enabled && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            The module is disabled, so this has no effect until it&apos;s enabled.
          </span>
        )}
        {error && <span className="form-error text-xs">{error}</span>}
      </span>
    </div>
  );
}

/** The admin-owned set that bounds a capability — rendered by core from the helper's declaration. */
function ScopeEditor({ helperId, permission }: { helperId: string; permission: string }) {
  const [items, setItems] = useState<ScopeItem[] | null>(null);
  const [toggle, setToggle] = useState<{ label: string; warning?: string } | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const res = await listScopeAction(helperId, permission);
    if (res.ok) {
      setItems(res.items);
      setToggle(res.itemToggle);
    } else setError(res.error);
  }

  async function edit(op: "add" | "remove", v: string) {
    setBusy(true);
    setError(null);
    const res = await editScopeAction(helperId, permission, op, v);
    if (!res.ok) setError(res.error);
    else setValue("");
    await load();
    setBusy(false);
  }

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
      <button
        type="button"
        className="text-xs font-medium"
        style={{ color: "var(--primary)" }}
        onClick={() => {
          setOpen((o) => !o);
          if (items === null) void load();
        }}
      >
        {open ? "Hide" : "Show"} what this is limited to
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {items === null ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Nothing on the list — the capability can&apos;t reach anything until something is added.
            </p>
          ) : (
            items.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span>{it.label}</span>
                  {/* The real value, verbatim, always beside the label. A module once displayed
                      "Add Plex" and submitted "sshd"; a label is never the only thing shown. */}
                  <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{it.value}</span>
                  {it.detail && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{it.detail}</span>
                  )}
                  {toggle && (
                    <ItemToggle
                      helperId={helperId}
                      permission={permission}
                      item={it}
                      declaration={toggle}
                      onChanged={load}
                    />
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost !py-1 text-xs"
                  disabled={busy}
                  onClick={() => void edit("remove", it.id)}
                  style={{ color: "var(--danger)" }}
                >
                  Remove
                </button>
              </div>
            ))
          )}

          {/* Browse first, typing second. If picking three services means typing three exact
              names, the one-click "everything" switch wins on effort alone — so the easy path
              has to be the bounded one. */}
          <Picker helperId={helperId} permission={permission} onAdded={load} busy={busy} setBusy={setBusy} />

          <details>
            <summary className="cursor-pointer text-xs" style={{ color: "var(--muted)" }}>
              Or type one in
            </summary>
            <div className="mt-2 flex gap-2">
              <input
                className="input text-sm"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Add…"
                disabled={busy}
              />
              <button
                type="button"
                className="btn btn-ghost !py-1.5 text-sm"
                disabled={busy || value.trim().length === 0}
                onClick={() => void edit("add", value.trim())}
              >
                Add
              </button>
            </div>
          </details>

          <Unbounded helperId={helperId} permission={permission} />
          {error && <span className="form-error text-xs">{error}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The per-item switch — "may a module act on this one without asking?".
 *
 * Sits **on the item**, not under the capability, because that is the thing it qualifies: a list
 * of five services where one runs unattended has to read as exactly that at a glance. It follows
 * the same asymmetry as the unbounded switch — turning one ON asks, turning it OFF doesn't —
 * because these two are the only controls on the page that remove a prompt the admin would
 * otherwise see, and a confirmation on the safe direction only trains people to click through.
 */
function ItemToggle({
  helperId,
  permission,
  item,
  declaration,
  onChanged,
}: {
  helperId: string;
  permission: string;
  item: ScopeItem;
  declaration: { label: string; warning?: string };
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = item.toggleOn === true;

  async function apply(want: boolean) {
    setBusy(true);
    setError(null);
    const res = await setItemToggleAction(helperId, permission, item.id, want);
    if (!res.ok) setError(res.error);
    setConfirming(false);
    // Re-read rather than assume: the helper owns this state, and the list is where it lives.
    await onChanged();
    setBusy(false);
  }

  return (
    <span className="mt-1 flex flex-col gap-1">
      <label className="flex cursor-pointer items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          className="flex-none"
          checked={on}
          disabled={busy}
          onChange={(e) => (e.target.checked ? setConfirming(true) : void apply(false))}
        />
        <span style={{ color: on ? "var(--warning)" : "var(--muted)" }}>{declaration.label}</span>
      </label>
      {confirming && (
        <span className="flex flex-wrap items-center gap-2">
          {declaration.warning && (
            <span className="text-xs" style={{ color: "var(--warning)" }}>{declaration.warning}</span>
          )}
          <button type="button" className="btn btn-danger !py-0.5 text-xs" disabled={busy} onClick={() => void apply(true)}>
            {declaration.label}
          </button>
          <button type="button" className="btn btn-ghost !py-0.5 text-xs" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      )}
      {error && <span className="form-error text-xs">{error}</span>}
    </span>
  );
}

/**
 * Tick what you want instead of typing it.
 *
 * Owner, 2026-07-26: *"I want the add/remove to be a lot easier so people aren't driven to use
 * it"* — "it" being the unbounded switch below. This is the mitigation that makes "everything" a
 * rare choice rather than the path of least resistance. A helper offering `unbounded` and no
 * `browse` has built the trap; core can't force it to provide one, but the UI puts browsing
 * first and pushes typing behind a fold regardless.
 */
function Picker({
  helperId,
  permission,
  onAdded,
  busy,
  setBusy,
}: {
  helperId: string;
  permission: string;
  onAdded: () => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ScopeCandidate[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string) {
    const res = await browseScopeAction(helperId, permission, q);
    // A helper with nothing to browse is normal, not an error — fall back to typing, quietly.
    if (!res.ok) {
      setUnavailable(true);
      return;
    }
    setCandidates(res.candidates);
  }

  async function addChosen() {
    setBusy(true);
    setError(null);
    // One at a time: a single rejected value must not silently take the rest down with it.
    for (const v of chosen) {
      const res = await editScopeAction(helperId, permission, "add", v);
      if (!res.ok) {
        setError(res.error);
        break;
      }
    }
    setChosen(new Set());
    await search(query);
    await onAdded();
    setBusy(false);
  }

  if (unavailable) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className="input text-sm"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            void search(e.target.value);
          }}
          onFocus={() => {
            if (candidates === null) void search("");
          }}
          placeholder="Search to add…"
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-primary !py-1.5 text-sm"
          disabled={busy || chosen.size === 0}
          onClick={() => void addChosen()}
        >
          Add {chosen.size > 0 ? chosen.size : ""}
        </button>
      </div>

      {candidates !== null && candidates.length === 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>Nothing matches.</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {candidates.map((c) => (
            <label key={c.value} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 flex-none"
                disabled={busy || c.alreadyAdded}
                checked={c.alreadyAdded || chosen.has(c.value)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(c.value);
                  else next.delete(c.value);
                  setChosen(next);
                }}
              />
              <span className="flex min-w-0 flex-col">
                <span>{c.label}</span>
                {/* The value, always — the same rule as everywhere else on this page. */}
                <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{c.value}</span>
                {c.detail && <span className="text-xs" style={{ color: "var(--muted)" }}>{c.detail}</span>}
                {c.alreadyAdded && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>already on the list</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
      {error && <span className="form-error text-xs">{error}</span>}
    </div>
  );
}

/**
 * The "everything" switch — no list at all.
 *
 * Kept apart from the list and styled as the serious choice it is. The helper's own warning is
 * shown verbatim, because only the helper knows what "everything" reaches; core's job is to make
 * sure it is read before the click rather than to paraphrase it.
 */
type OptionState = { label: string; warning?: string; on: boolean };

function Unbounded({ helperId, permission }: { helperId: string; permission: string }) {
  const [state, setState] = useState<{ on: boolean; warning: string; option: OptionState | null } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingOption, setConfirmingOption] = useState(false);

  // Kept inline rather than extracted into a shared `load()`: the React Compiler rejects a
  // component-scope function that calls setState being invoked from an effect
  // (react-hooks/set-state-in-effect), and it can see through the extraction. Same reason the
  // widget grid ended up keyed rather than synced in 1.7.0-beta.3.
  useEffect(() => {
    let live = true;
    unboundedStateAction(helperId, permission)
      .then((r) => {
        if (!live) return;
        // A capability that is always bounded is the safer shape and entirely normal — show
        // nothing rather than an error.
        if (r.ok) setState({ on: r.on, warning: r.warning, option: r.option });
        else setUnavailable(true);
      })
      .catch(() => live && setUnavailable(true));
    return () => {
      live = false;
    };
  }, [helperId, permission]);

  async function apply(on: boolean) {
    setBusy(true);
    setError(null);
    const res = await setUnboundedAction(helperId, permission, on);
    if (res.ok) setState((s) => (s ? { ...s, on } : s));
    else setError(res.error);
    setConfirming(false);
    setBusy(false);
  }

  async function applyOption(on: boolean) {
    setBusy(true);
    setError(null);
    const res = await setUnboundedOptionAction(helperId, permission, on);
    if (!res.ok) setError(res.error);
    setConfirmingOption(false);
    // Re-read rather than assume: the helper owns this, so after a refusal the switch must show
    // what is actually true, not what was clicked.
    const fresh = await unboundedStateAction(helperId, permission);
    if (fresh.ok) setState({ on: fresh.on, warning: fresh.warning, option: fresh.option });
    setBusy(false);
  }

  if (unavailable || state === null) return null;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        border: `1px solid ${state.on ? "var(--danger)" : "var(--border)"}`,
        background: state.on ? "color-mix(in srgb, var(--danger) 8%, transparent)" : "transparent",
      }}
    >
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 flex-none"
          checked={state.on}
          disabled={busy}
          onChange={(e) => {
            // Widening asks twice; narrowing is immediate. Confirming a revocation would only
            // teach people to click through the dialog that matters.
            if (e.target.checked) setConfirming(true);
            else void apply(false);
          }}
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold" style={{ color: state.on ? "var(--danger)" : "var(--foreground)" }}>
            Allow everything — no list
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>{state.warning}</span>
        </span>
      </label>

      {confirming && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: "var(--danger)" }}>
            The list above stops applying. Sure?
          </span>
          <button type="button" className="btn btn-danger !py-1 text-xs" disabled={busy} onClick={() => void apply(true)}>
            Allow everything
          </button>
          <button type="button" className="btn btn-ghost !py-1 text-xs" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* The dependent option — only while the grant it qualifies is actually on. Showing it
          beneath a switched-off grant would imply a protection that is currently protecting
          nothing. */}
      {state.on && state.option && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 flex-none"
              checked={state.option.on}
              disabled={busy}
              onChange={(e) => {
                // INVERTED on purpose. Everywhere else ON widens and therefore asks; this one
                // protects, so switching it OFF is the widening step and the one that confirms.
                if (e.target.checked) void applyOption(true);
                else setConfirmingOption(true);
              }}
            />
            <span className="flex flex-col gap-0.5">
              <span style={{ color: state.option.on ? "var(--foreground)" : "var(--danger)" }}>
                {state.option.label}
              </span>
              {!state.option.on && (
                <span className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
                  Currently off — the grant above is at its widest.
                </span>
              )}
            </span>
          </label>

          {confirmingOption && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: "var(--danger)" }}>
                {state.option.warning ?? "This removes the protection. Sure?"}
              </span>
              <button
                type="button"
                className="btn btn-danger !py-1 text-xs"
                disabled={busy}
                onClick={() => void applyOption(false)}
              >
                Remove the protection
              </button>
              <button type="button" className="btn btn-ghost !py-1 text-xs" onClick={() => setConfirmingOption(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {error && <span className="form-error text-xs">{error}</span>}
    </div>
  );
}
