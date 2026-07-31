"use client";

import { useActionState } from "react";
import { SaveBar, useFormDirty, useServerValue } from "@/app/components/save-bar";
import type { SettingView, SettingsFormState } from "@/lib/settings";

const initial: SettingsFormState = {};

type SettingsAction = (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

/** REFS app/admin/settings/page.tsx · app/admin/audit/page.tsx — both render the generic form
 *  lib/settings.ts › SettingView · applySettingsFormDetailed() */
export function SettingsForm({
  settings,
  action: serverAction,
  saveLabel = "Save settings",
}: {
  settings: SettingView[];
  action: SettingsAction;
  saveLabel?: string;
}) {
  const [state, action, pending] = useActionState(serverAction, initial);
  const { dirty, dirtyProps } = useFormDirty(state);

  return (
    <form action={action} {...dirtyProps} className="flex flex-col gap-5">
      {settings.map((s) => (
        <SettingField key={s.key} setting={s} error={state.errors?.[s.key]} />
      ))}

      <SaveBar dirty={dirty} pending={pending} success={state.success} label={saveLabel} />
    </form>
  );
}

/**
 * One field, as its own component so it can hold a hook. ⚠ A `useState` map in the parent would
 * re-seed every field whenever any one moved; a component per field ties each value's lifetime to
 * its own field, which is what `useServerValue` needs to spot a real server change.
 * REFS app/components/save-bar.tsx › useServerValue()
 */
function SettingField({ setting: s, error }: { setting: SettingView; error?: string }) {
  /*
   * ⚠ Controlled, never `defaultValue`: settings are trimmed, clamped and coerced on the way in, so
   * after a save the stored value often is not the typed one — and a seeded input would keep
   * showing the typed version as though it were what is in the database.
   * REFS lib/settings.ts › writeSetting() — where that normalisation happens
   */
  const [value, setValue] = useServerValue(s.value);

  return (
    <div>
      <label className="label" htmlFor={s.key}>
        {s.label}
      </label>
      <input
        id={s.key}
        name={s.key}
        type={s.secret ? "password" : s.kind === "string" ? "text" : "number"}
        inputMode={s.kind === "string" ? undefined : "numeric"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input"
      />
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        {s.help}
      </p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
