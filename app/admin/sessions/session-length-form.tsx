"use client";

import { useActionState } from "react";
import { SaveBar, selectSync, useFormDirty, useServerValue } from "@/app/components/save-bar";
import { saveSessionSettingsAction } from "./actions";
import type { SettingsFormState } from "@/lib/settings";

/**
 * The single session control, replacing the old lifetime + idle-timeout pair. ⚠ A picker, not a
 * number box: one field has to express both "2 hours" and "30 days", a minutes input reading 43200
 * tells nobody anything, and presets keep the two genuinely bad answers a decision rather than a
 * typo. REFS lib/settings.ts › SETTINGS["session.lengthMinutes"] · ../actions.ts
 */
const PRESETS: { minutes: number; label: string }[] = [
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 480, label: "8 hours" },
  { minutes: 1440, label: "1 day" },
  { minutes: 10080, label: "7 days" },
  { minutes: 43200, label: "30 days" },
  { minutes: 129600, label: "90 days" },
  // ⚠ The ceiling, and deliberately equal to `SESSION_ABSOLUTE_CAP_DAYS`: past it the idle window
  // can never be reached, because the absolute cap ends the session first.
  { minutes: 525600, label: "365 days" },
];

/** Render an arbitrary stored value — a migrated one may not be a preset. */
function describe(minutes: number): string {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

/** REFS ../sessions/page.tsx — the only caller · ../sessions/actions.ts */
export function SessionLengthForm({ current, capDays }: { current: number; capDays: number }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    saveSessionSettingsAction,
    {},
  );

  /*
   * ⚠ CONTROLLED, never `defaultValue`. Note that this alone did not fix the revert: the value the
   * server sent back was itself stale, because settings were cached in a module-level map and an
   * action runs in a DIFFERENT module instance from the render. That cache is gone.
   * REFS app/components/save-bar.tsx › useServerValue() · lib/settings.ts › clearSettingsCache()
   */
  const [value, setValue] = useServerValue(current);

  /*
   * ⚠ Taken for its `onReset` alone, which cancels React's post-action form reset — without it this
   * select snaps back to the value the page loaded with. The form's own `dirty` below is finer,
   * because picking a value and putting it back reads as clean.
   * REFS app/components/save-bar.tsx › useFormDirty()
   */
  const { dirtyProps } = useFormDirty(state);

  /*
   * ⚠ An upgrade from the old pair can land on a value no preset matches, so the stored one is
   * added to the list — otherwise the control silently presents a different number as theirs.
   * REFS prisma/migrations/20260727230000_session_length
   */
  const options = PRESETS.some((p) => p.minutes === current)
    ? PRESETS
    : [...PRESETS, { minutes: current, label: `${describe(current)} (your current setting)` }].sort(
        (a, b) => a.minutes - b.minutes,
      );

  const dirty = value !== current;

  return (
    <form action={action} {...dirtyProps} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="session-length" className="text-sm font-medium">
          Session length
        </label>
        <select
          id="session-length"
          name="session.lengthMinutes"
          value={String(value)}
          {...selectSync((v) => setValue(Number(v)))}
          className="input max-w-xs"
          disabled={pending}
        >
          {options.map((o) => (
            <option key={o.minutes} value={o.minutes}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          How long you stay signed in without using JonDash. Keep using it and you stay signed in;
          leave it alone for longer than this and you&apos;ll be asked to sign in again.
        </p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Whatever you choose, a sign-in is never valid for more than{" "}
          <strong>{capDays} days</strong> — so a session can&apos;t live forever even if it&apos;s
          used every day.
        </p>
        {state.errors?.["session.lengthMinutes"] && (
          <span className="form-error">{state.errors["session.lengthMinutes"]}</span>
        )}
      </div>

      <SaveBar dirty={dirty} pending={pending} success={state.success} label="Save session settings" />
    </form>
  );
}
