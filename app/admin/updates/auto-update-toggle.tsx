"use client";

import { setHelperAutoUpdateAction } from "./schedule-actions";
import { setModuleAutoUpdateAction } from "../modules/actions";

/**
 * Per-item opt-in to automatic updates, for one module or one helper.
 *
 * Deliberately per item and never a single global switch: one tick must not hand every
 * source — including any public repo added by URL — a standing channel to run new code on
 * this machine. You opt in to the things you trust.
 *
 * A checkbox that submits on change rather than a save button: the alternative is a page
 * of ticks and one Save, where forgetting to press it looks identical to having opted in.
 */
export function AutoUpdateToggle({
  kind,
  id,
  on,
  disabledReason,
}: {
  kind: "module" | "helper";
  id: string;
  on: boolean;
  disabledReason?: string;
}) {
  const action = kind === "helper" ? setHelperAutoUpdateAction : setModuleAutoUpdateAction;

  return (
    <form action={action} className="flex items-center gap-2">
      {/* The two actions predate each other and name the field differently. */}
      <input type="hidden" name={kind === "helper" ? "id" : "moduleId"} value={id} />
      {/* Unchecking must SEND something — an unchecked box submits nothing at all, which
          would read as "no change" and make the toggle one-way. */}
      <input type="hidden" name="autoUpdate" value={on ? "off" : "on"} />
      <button
        type="submit"
        disabled={!!disabledReason}
        title={disabledReason ?? undefined}
        className="flex items-center gap-2 text-xs"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: disabledReason ? "not-allowed" : "pointer",
          opacity: disabledReason ? 0.5 : 1,
          color: "var(--muted)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            flex: "none",
            border: "1px solid var(--border-strong, #999)",
            background: on ? "var(--primary)" : "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 10,
            lineHeight: 1,
          }}
        >
          {on ? "✓" : ""}
        </span>
        Update automatically
      </button>
    </form>
  );
}
