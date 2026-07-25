"use client";

import { useActionState, useState } from "react";
import { saveStyleAction } from "./actions";
import type { SettingsFormState } from "@/lib/settings";
import { stylesByFamily, findStyle, resolvePalette, type StyleOption, type Palette } from "@/lib/styles";

/**
 * Interface-style picker (CORE-07). Two levels, because a style and a palette are two
 * different choices: **structure** (compact tiles, grouped by family) then **colour**
 * (palettes belonging to the chosen style).
 *
 * Each tile draws itself from the style's structure and the palette's colours, so a preview
 * can't drift from the real thing (docs/STYLES.md §6). Selecting only highlights — nothing
 * changes until Apply, so you can browse freely.
 */
function Mini({ style, palette, size = "sm" }: { style: StyleOption; palette: Palette; size?: "sm" | "lg" }) {
  const r = style.swatch.radius;
  const bw = style.swatch.fat ? "2px" : "1px";
  return (
    <span
      className="block overflow-hidden rounded"
      style={{ background: palette.bg, padding: size === "lg" ? "8px" : "6px", fontFamily: style.swatch.font ?? "inherit" }}
      aria-hidden
    >
      <span
        className="block overflow-hidden"
        style={{
          background: palette.surface,
          border: `${bw} solid ${style.swatch.border}`,
          borderRadius: r,
          color: palette.text,
        }}
      >
        {style.swatch.titleBar && (
          <span className="block px-1.5 py-0.5 text-[8px] font-bold" style={{ background: palette.accent, color: "#fff" }}>
            ▪
          </span>
        )}
        <span className="flex flex-col gap-1 p-1.5">
          <span className="block h-1.5 w-10 rounded-sm" style={{ background: "currentColor", opacity: 0.55 }} />
          <span className="block h-3 w-full" style={{ background: "rgba(127,127,127,0.16)", border: `1px solid ${style.swatch.border}` }} />
          <span
            className="mt-0.5 block h-3 w-9"
            style={{ background: palette.accent, borderRadius: r === "0px" ? "0" : "999px" }}
          />
        </span>
      </span>
    </span>
  );
}

export function StyleForm({ current, currentPalette }: { current: string; currentPalette: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveStyleAction, {});
  const [styleId, setStyleId] = useState(current);
  const [paletteId, setPaletteId] = useState(currentPalette);

  const style = findStyle(styleId);
  // Changing style must not carry a palette that doesn't exist there.
  const palette = resolvePalette(styleId, paletteId);
  const unchanged = styleId === current && palette.id === currentPalette;

  function pickStyle(id: string) {
    setStyleId(id);
    setPaletteId(resolvePalette(id, paletteId).id);
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="style" value={styleId} />
      <input type="hidden" name="palette" value={palette.id} />

      {stylesByFamily().map((g) => (
        <div key={g.family} className="flex flex-col gap-2">
          <div
            className="border-t pt-2 text-[10px] font-bold uppercase"
            style={{ color: "var(--muted)", borderColor: "var(--border)", letterSpacing: "0.12em", opacity: 0.85 }}
          >
            {g.family}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {g.styles.map((s) => {
              const selected = styleId === s.id;
              return (
                <label
                  key={s.id}
                  className="flex cursor-pointer flex-col gap-1.5 rounded-lg p-2 transition"
                  style={{
                    border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                    background: selected ? "var(--surface-2)" : "transparent",
                  }}
                  title={s.description}
                >
                  <input
                    type="radio"
                    name="style-pick"
                    value={s.id}
                    checked={selected}
                    onChange={() => pickStyle(s.id)}
                    className="sr-only"
                  />
                  <Mini style={s} palette={resolvePalette(s.id, selected ? palette.id : "")} />
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-xs font-semibold">{s.name}</span>
                    <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                      {s.palettes.length}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {/* Palettes for the chosen style. Always shown — every style has at least one, and
          seeing the options is the point of splitting colour out of structure. */}
      <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
        <div className="text-[10px] font-bold uppercase" style={{ color: "var(--muted)", letterSpacing: "0.12em" }}>
          {style.name} palette
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {style.palettes.map((p) => {
            const selected = palette.id === p.id;
            return (
              <label
                key={p.id}
                className="flex cursor-pointer flex-col gap-1 rounded-lg p-1.5 transition"
                style={{
                  border: `2px solid ${selected ? "var(--primary)" : "transparent"}`,
                  background: selected ? "var(--surface)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="palette-pick"
                  value={p.id}
                  checked={selected}
                  onChange={() => setPaletteId(p.id)}
                  className="sr-only"
                />
                <span className="flex h-6 overflow-hidden rounded" style={{ border: "1px solid var(--border)" }} aria-hidden>
                  <span className="block w-1/3" style={{ background: p.bg }} />
                  <span className="block w-1/3" style={{ background: p.surface }} />
                  <span className="block w-1/3" style={{ background: p.accent }} />
                </span>
                <span className="truncate text-[11px]">{p.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        <strong style={{ color: "var(--foreground)" }}>{style.name} · {palette.name}</strong> — {style.description}
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary text-sm" disabled={pending || unchanged}>
          {pending ? "Applying…" : unchanged ? "Currently applied" : `Apply ${style.name} · ${palette.name}`}
        </button>
        {state.success && <span className="text-sm" style={{ color: "var(--muted)" }}>{state.success}</span>}
        {state.errors?.["branding.style"] && <span className="form-error">{state.errors["branding.style"]}</span>}
      </div>
    </form>
  );
}
