"use client";

import { useActionState } from "react";
import { SaveBar, useFormDirty, useServerValue } from "@/app/components/save-bar";
import type { SettingView, SettingsFormState } from "@/lib/settings";

const initial: SettingsFormState = {};

type SettingsAction = (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

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
 * One field, as its own component so it can hold a hook.
 *
 * The alternative — a `useState` map in the parent — would have to be rebuilt whenever the
 * settings list changes and would re-seed every field when any one of them moved. A component
 * per field keeps each value's lifetime tied to the field it belongs to, which is what
 * `useServerValue` needs to know when the server has genuinely changed something.
 */
function SettingField({ setting: s, error }: { setting: SettingView; error?: string }) {
  /*
   * Controlled, so a save can correct what's on screen.
   *
   * `defaultValue` seeds an input once and then ignores the server forever. Settings get
   * normalised on the way in — trimmed, clamped, coerced — so after a save the stored value
   * frequently isn't the typed one, and the field would carry on showing the typed version as
   * though it were what's in the database.
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
