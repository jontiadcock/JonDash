"use client";

import { useActionState } from "react";
import { SaveBar, useFormDirty, useServerValue } from "@/app/components/save-bar";
import { saveModuleSettingsAction, type ModuleSettingsState } from "../actions";

/** REFS app/admin/modules/[id]/page.tsx */
export type SettingFieldView = {
  key: string;
  label: string;
  type: "string" | "text" | "number" | "boolean";
  help: string | null;
  secret: boolean;
  value: unknown; // null for secret fields (never sent to the client)
  hasValue: boolean;
};

/** REFS app/admin/modules/[id]/page.tsx */
export function ModuleSettingsForm({ moduleId, fields }: { moduleId: string; fields: SettingFieldView[] }) {
  const [state, action, pending] = useActionState<ModuleSettingsState, FormData>(saveModuleSettingsAction, {});
  const { dirty, dirtyProps, generation } = useFormDirty(state);

  return (
    <form action={action} {...dirtyProps} className="flex flex-col gap-4">
      <input type="hidden" name="__moduleId" value={moduleId} />
      {fields.map((f) => (
        <ModuleField key={f.key} field={f} generation={generation} />
      ))}
      <SaveBar
        dirty={dirty}
        pending={pending}
        success={state.ok ? "Saved." : null}
        error={state.error}
        label="Save"
      />
    </form>
  );
}

/** One module setting. Its own component so each value's state belongs to its own field. */
function ModuleField({ field: f, generation }: { field: SettingFieldView; generation: number }) {
  /*
   * Controlled from the server value, so a module that normalises what it stores shows what it
   * actually kept rather than what was typed.
   *
   * **Secret fields are the exception and stay uncontrolled.** Their value is never sent to the
   * browser, so there is nothing to seed from and nothing to re-seed with. They are keyed on
   * `generation` so they remount empty after a save, which is the right end state for a field
   * whose placeholder then reads "leave blank to keep".
   */
  const [value, setValue] = useServerValue(f.value == null ? "" : String(f.value));
  const [checked, setChecked] = useServerValue(!!f.value);

  return (
    <div className="flex flex-col gap-1">
      {f.type === "boolean" ? (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name={f.key}
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium">{f.label}</span>
        </label>
      ) : f.type === "text" && !f.secret ? (
        <>
          {/* Multiline: a JSON blob or a list of hosts is unusable in a one-line input. */}
          <label className="label" htmlFor={`m-${f.key}`}>{f.label}</label>
          <textarea
            id={`m-${f.key}`}
            name={f.key}
            rows={8}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input font-mono text-sm"
            style={{ resize: "vertical", minHeight: "8rem" }}
            spellCheck={false}
          />
        </>
      ) : (
        <>
          <label className="label" htmlFor={`m-${f.key}`}>{f.label}</label>
          <input
            key={f.secret ? `${f.key}-${generation}` : f.key}
            id={`m-${f.key}`}
            name={f.key}
            type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
            {...(f.secret
              ? { defaultValue: "" }
              : { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value) })}
            placeholder={f.secret ? (f.hasValue ? "•••••• (leave blank to keep)" : "") : undefined}
            className="input"
            autoComplete={f.secret ? "new-password" : "off"}
          />
        </>
      )}
      {f.help && <p className="text-xs" style={{ color: "var(--muted)" }}>{f.help}</p>}
    </div>
  );
}
