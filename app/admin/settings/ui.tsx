"use client";

import { useActionState } from "react";
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

  return (
    <form action={action} className="flex flex-col gap-5">
      {settings.map((s) => (
        <div key={s.key}>
          <label className="label" htmlFor={s.key}>
            {s.label}
          </label>
          {s.kind === "string" ? (
            <input
              id={s.key}
              name={s.key}
              type={s.secret ? "password" : "text"}
              defaultValue={s.value}
              className="input"
            />
          ) : (
            <input
              id={s.key}
              name={s.key}
              type="number"
              inputMode="numeric"
              defaultValue={s.value}
              className="input"
            />
          )}
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {s.help}
          </p>
          {state.errors?.[s.key] && <p className="form-error">{state.errors[s.key]}</p>}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : saveLabel}
        </button>
        {state.success && (
          <span className="text-sm" style={{ color: "var(--primary)" }}>
            {state.success}
          </span>
        )}
      </div>
    </form>
  );
}
