"use client";

import { useActionState, useState } from "react";
import { saveUpdateScheduleAction, type ScheduleState } from "./schedule-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * When automatic updates run.
 *
 * The day fields are shown only for the frequency that uses them — but both are always
 * RENDERED (hidden, not removed) so their values round-trip on save instead of being
 * cleared by switching frequency and switching back.
 */
export function UpdateScheduleForm({
  frequency,
  timeOfDay,
  dayOfWeek,
  dayOfMonth,
  optedInCount,
  summary,
}: {
  frequency: string;
  timeOfDay: string;
  dayOfWeek: number;
  dayOfMonth: number;
  optedInCount: number;
  summary: string;
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(
    saveUpdateScheduleAction,
    {},
  );
  const [freq, setFreq] = useState(frequency);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Automatic updates</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {optedInCount === 0 ? (
            <>
              Nothing is set to update automatically yet. Tick <strong>Update automatically</strong> on a
              module or helper below, and it will be updated on this schedule.
            </>
          ) : (
            <>
              {summary} — {optedInCount} {optedInCount === 1 ? "item is" : "items are"} set to update
              automatically. Applying an update restarts the dashboard and signs everyone out, so pick a
              quiet time.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="updates.frequency">How often</label>
          <select
            id="updates.frequency"
            name="updates.frequency"
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            className="input"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="updates.timeOfDay">At</label>
          <input
            id="updates.timeOfDay"
            name="updates.timeOfDay"
            type="time"
            defaultValue={timeOfDay}
            className="input"
          />
        </div>

        <div style={{ display: freq === "weekly" ? undefined : "none" }}>
          <label className="label" htmlFor="updates.dayOfWeek">On</label>
          <select id="updates.dayOfWeek" name="updates.dayOfWeek" defaultValue={String(dayOfWeek)} className="input">
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>

        <div style={{ display: freq === "monthly" ? undefined : "none" }}>
          <label className="label" htmlFor="updates.dayOfMonth">Day of the month</label>
          <select id="updates.dayOfMonth" name="updates.dayOfMonth" defaultValue={String(dayOfMonth)} className="input">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Up to 28, so it never skips a short month.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save schedule"}
        </button>
        {state.ok && <span className="text-sm" style={{ color: "var(--primary)" }}>Saved.</span>}
        {state.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
