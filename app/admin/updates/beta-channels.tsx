"use client";

import { useState } from "react";
import { setModuleChannelAction } from "../modules/actions";
import { setAppChannelAction, setHelperChannelPinAction } from "./schedule-actions";

export type BetaItem = {
  kind: "app" | "module" | "helper";
  id: string;
  name: string;
  onBeta: boolean;
  /** Helpers only: the channel is normally DERIVED from the modules that need them. */
  derived?: boolean;
  note?: string;
};

/**
 * One place to see and change what is on beta (owner ask, 2026-07-23).
 *
 * The app's channel lived here, a module's on its own page, a helper's on the Helpers
 * page — so "what am I running pre-release code for?" could not be answered anywhere.
 * Collapsed by default: most installs are entirely on stable and it should not take up
 * room saying so.
 */
export function BetaChannels({ items }: { items: BetaItem[] }) {
  const onBetaCount = items.filter((i) => i.onBeta).length;
  const [open, setOpen] = useState(onBetaCount > 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={open}
      >
        <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 12 }}>{open ? "▾" : "▸"}</span>
        <span className="text-lg font-medium">Beta channels</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {onBetaCount === 0 ? "everything on stable" : `${onBetaCount} on beta`}
        </span>
      </button>

      {open && (
        <>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Beta gives you pre-release versions, which may be less stable. Each of these is separate —
            you can run one module on beta with everything else on stable.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {items.map((it) => (
              <BetaRow key={`${it.kind}:${it.id}`} item={it} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BetaRow({ item }: { item: BetaItem }) {
  const action =
    item.kind === "app"
      ? setAppChannelAction
      : item.kind === "module"
        ? setModuleChannelAction
        : setHelperChannelPinAction;

  // Each action predates the others and names its field differently.
  const idField = item.kind === "module" ? "id" : item.kind === "helper" ? "helperId" : "unused";

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-3 rounded-lg p-3"
      style={{ background: "var(--surface-2)" }}
    >
      <input type="hidden" name={idField} value={item.id} />
      {/* An unchecked switch submits nothing, so the target channel is sent explicitly. */}
      <input type="hidden" name="channel" value={item.onBeta ? "stable" : "beta"} />

      <span className="min-w-0 flex-1">
        <span className="font-medium">{item.name}</span>
        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
          {item.kind === "app" ? "JonDash itself" : item.kind}
          {item.derived ? " · follows the modules that need it" : ""}
        </span>
        {item.note && (
          <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>{item.note}</span>
        )}
      </span>

      <button
        type="submit"
        aria-label={`${item.onBeta ? "Leave" : "Join"} beta for ${item.name}`}
        title={item.onBeta ? "On beta — click to return to stable" : "On stable — click to join beta"}
        style={{
          width: 42,
          height: 24,
          flex: "none",
          borderRadius: 999,
          border: "1px solid var(--border-strong, #999)",
          background: item.onBeta ? "var(--primary)" : "transparent",
          position: "relative",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            left: item.onBeta ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: item.onBeta ? "#fff" : "var(--border-strong, #999)",
            transition: "left 120ms",
          }}
        />
      </button>
    </form>
  );
}
