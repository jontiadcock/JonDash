"use client";

import { useActionState } from "react";
import { saveStyleAction } from "./actions";
import type { SettingsFormState } from "@/lib/settings";
import { STYLES } from "@/lib/styles";

/**
 * Interface-style picker (CORE-07). Each option previews itself using the same tokens the
 * style defines, so the swatch can't drift from the real thing.
 *
 * Adding a style: define it in `globals.css`, allow its id in the `branding.style` setting,
 * and add a row here — see docs/STYLES.md §6 for the full checklist.
 */


export function StyleForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveStyleAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STYLES.map((s) => {
          const selected = current === s.id;
          return (
            <label
              key={s.id}
              className="flex cursor-pointer flex-col gap-2 rounded-xl p-3 transition"
              style={{
                border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                background: selected ? "var(--surface-2)" : "transparent",
              }}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="style" value={s.id} defaultChecked={selected} />
                <span className="text-sm font-semibold">{s.name}</span>
              </span>

              {/* A miniature of the style, drawn with its own values. */}
              <span
                className="flex h-16 items-end gap-1.5 overflow-hidden rounded-lg p-2"
                style={{ background: s.swatch.bg }}
                aria-hidden
              >
                <span
                  className="flex h-full flex-1 items-end p-1.5"
                  style={{
                    background: s.swatch.surface,
                    border: `1px solid ${s.swatch.border}`,
                    borderRadius: s.swatch.radius,
                    backdropFilter: s.id === "crystal" ? "blur(4px)" : undefined,
                  }}
                >
                  <span
                    className="block h-3 w-10"
                    style={{ background: s.swatch.accent, borderRadius: s.id === "crystal" ? "999px" : s.swatch.radius }}
                  />
                </span>
              </span>

              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {s.description}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
          {pending ? "Applying…" : "Apply style"}
        </button>
        {state.success && (
          <span className="text-sm" style={{ color: "var(--muted)" }}>{state.success}</span>
        )}
        {state.errors?.["branding.style"] && (
          <span className="form-error">{state.errors["branding.style"]}</span>
        )}
      </div>
    </form>
  );
}
