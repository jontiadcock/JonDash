"use client";

import { useActionState } from "react";
import { SaveBar, selectSync, useFormDirty, useServerValue } from "@/app/components/save-bar";
import { saveSessionSettingsAction } from "./actions";
import type { SettingsFormState } from "@/lib/settings";

/**
 * The single session control (1.8.0), replacing "Session lifetime (days)" + "Idle timeout
 * (minutes)".
 *
 * **A picker, not a number box.** One field now has to express both "2 hours" and "30 days",
 * and a minutes input that reads 43200 tells nobody anything. Presets also stop the two
 * genuinely bad answers — a few seconds, or effectively never — being a typo away.
 */
const PRESETS: { minutes: number; label: string }[] = [
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 480, label: "8 hours" },
  { minutes: 1440, label: "1 day" },
  { minutes: 10080, label: "7 days" },
  { minutes: 43200, label: "30 days" },
  { minutes: 129600, label: "90 days" },
  // The ceiling. Deliberately the same as SESSION_ABSOLUTE_CAP_DAYS: past this the idle window
  // could never be reached, because the absolute cap would always end the session first — an
  // option that can never take effect is worse than no option.
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

export function SessionLengthForm({ current, capDays }: { current: number; capDays: number }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    saveSessionSettingsAction,
    {},
  );

  /*
   * CONTROLLED, not `defaultValue` — that was a real bug the owner hit (1.8.0-beta.8), and the
   * pattern is now shared by every settings form (`useServerValue`, app/components/save-bar.tsx).
   *
   * That change alone did not fix it, and the honest reason is worth keeping: the value the
   * server sent back was itself stale, because `lib/settings.ts` cached reads in a module-level
   * map and a server action runs in a DIFFERENT module instance from the page render — so the
   * action's cache-clear never reached the renderer's cache. Re-seeding from a stale server
   * value made the revert *more* reliable, not less. The cache is gone (1.8.0-beta.11).
   */
  const [value, setValue] = useServerValue(current);

  /*
   * Only `dirtyProps` is used here — this form's own `dirty` below is finer, because comparing
   * the value to the server's means picking a setting and putting it back reads as clean.
   * What is needed from the hook is its `onReset`, which cancels React's post-action form reset;
   * without it this select snaps back to the value the page loaded with. See save-bar.tsx.
   */
  const { dirtyProps } = useFormDirty(state);

  /*
   * An install upgrading from the old pair can land on a value no preset matches — someone who
   * had a 15-minute idle timeout, or a 21-day lifetime. Adding it to the list means their
   * setting is still shown and still selected, rather than the control silently presenting a
   * different number as if it were theirs.
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
