"use client";

import { useActionState } from "react";
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

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="session-length" className="text-sm font-medium">
          Session length
        </label>
        <select
          id="session-length"
          name="session.lengthMinutes"
          defaultValue={String(current)}
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

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save session settings"}
        </button>
        {state.success && (
          <span className="text-sm" style={{ color: "var(--success)" }}>
            {state.success}
          </span>
        )}
      </div>
    </form>
  );
}
