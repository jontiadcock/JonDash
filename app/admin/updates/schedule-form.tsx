"use client";

import { useActionState } from "react";
import { SaveBar, selectSync, useFormDirty, useServerValue } from "@/app/components/save-bar";
import { saveUpdateScheduleAction, type ScheduleState } from "./schedule-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * When automatic updates run.
 *
 * The day fields are shown only for the frequency that uses them — but both are always
 * RENDERED (hidden, not removed) so their values round-trip on save instead of being
 * cleared by switching frequency and switching back.
 * REFS app/admin/updates/page.tsx
 */
export function UpdateScheduleForm({
  frequency,
  timeOfDay,
  dayOfWeek,
  dayOfMonth,
}: {
  frequency: string;
  timeOfDay: string;
  dayOfWeek: number;
  dayOfMonth: number;
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(
    saveUpdateScheduleAction,
    {},
  );
  const { dirty, dirtyProps } = useFormDirty(state);
  // Controlled and re-seeded from the server — see the note in app/components/save-bar.tsx.
  const [freq, setFreq] = useServerValue(frequency);
  const [time, setTime] = useServerValue(timeOfDay);
  const [dow, setDow] = useServerValue(String(dayOfWeek));
  const [dom, setDom] = useServerValue(String(dayOfMonth));

  return (
    <form action={action} {...dirtyProps} className="flex flex-col gap-4">
      {/* No heading here: this renders INSIDE the Automatic updates panel, which already
          has one. Two cards both titled "Automatic updates" is what this replaced. */}
      <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
        When it runs
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="updates.frequency">How often</label>
          <select
            id="updates.frequency"
            name="updates.frequency"
            value={freq}
            {...selectSync(setFreq)}
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
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="input"
          />
        </div>

        <div style={{ display: freq === "weekly" ? undefined : "none" }}>
          <label className="label" htmlFor="updates.dayOfWeek">On</label>
          <select
            id="updates.dayOfWeek"
            name="updates.dayOfWeek"
            value={dow}
            {...selectSync(setDow)}
            className="input"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>

        <div style={{ display: freq === "monthly" ? undefined : "none" }}>
          <label className="label" htmlFor="updates.dayOfMonth">Day of the month</label>
          <select
            id="updates.dayOfMonth"
            name="updates.dayOfMonth"
            value={dom}
            {...selectSync(setDom)}
            className="input"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Up to 28, so it never skips a short month.
          </p>
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        success={state.ok ? "Saved." : null}
        error={state.error}
        label="Save schedule"
      />
    </form>
  );
}
