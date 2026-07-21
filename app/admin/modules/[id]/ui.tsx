"use client";

import { useActionState } from "react";
import { saveModuleSettingsAction, type ModuleSettingsState } from "../actions";

export type SettingFieldView = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean";
  help: string | null;
  secret: boolean;
  value: unknown; // null for secret fields (never sent to the client)
  hasValue: boolean;
};

export function ModuleSettingsForm({ moduleId, fields }: { moduleId: string; fields: SettingFieldView[] }) {
  const [state, action, pending] = useActionState<ModuleSettingsState, FormData>(saveModuleSettingsAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="__moduleId" value={moduleId} />
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          {f.type === "boolean" ? (
            <label className="flex items-center gap-3">
              <input type="checkbox" name={f.key} defaultChecked={!!f.value} className="h-4 w-4" />
              <span className="text-sm font-medium">{f.label}</span>
            </label>
          ) : (
            <>
              <label className="label" htmlFor={`m-${f.key}`}>{f.label}</label>
              <input
                id={`m-${f.key}`}
                name={f.key}
                type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
                defaultValue={f.secret ? "" : f.value == null ? "" : String(f.value)}
                placeholder={f.secret ? (f.hasValue ? "•••••• (leave blank to keep)" : "") : undefined}
                className="input"
                autoComplete={f.secret ? "new-password" : "off"}
              />
            </>
          )}
          {f.help && <p className="text-xs" style={{ color: "var(--muted)" }}>{f.help}</p>}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary self-start" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok && <span className="text-sm" style={{ color: "var(--primary)" }}>Saved.</span>}
        {state.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
