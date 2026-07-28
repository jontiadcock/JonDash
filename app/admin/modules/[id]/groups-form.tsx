"use client";

import { useActionState } from "react";
import { SaveBar, useFormDirty, useServerValue } from "@/app/components/save-bar";
import { setModuleGroupsAction, type ModuleSettingsState } from "../actions";

/**
 * Assign a module to Service Groups. Ticking none is a meaningful choice ("everyone"),
 * so the state is always shown explicitly rather than left to be inferred from an empty
 * list — an admin should never have to guess whether a module is restricted.
 */
export function ModuleGroupsForm({
  moduleId,
  groups,
  selected,
}: {
  moduleId: string;
  groups: { id: string; name: string }[];
  selected: string[];
}) {
  const [state, action, pending] = useActionState<ModuleSettingsState, FormData>(setModuleGroupsAction, {});
  const { dirty, dirtyProps } = useFormDirty(state);

  /*
   * Held as a sorted comma-joined string rather than a Set or an array.
   *
   * `useServerValue` re-seeds when the server's value changes, which it decides by identity — and
   * `selected` is a fresh array on every render, so an array would re-seed constantly and wipe a
   * selection mid-edit. A canonical string compares by value, which is what's actually meant.
   */
  const [chosenCsv, setChosenCsv] = useServerValue([...selected].sort().join(","));
  const chosen = new Set(chosenCsv ? chosenCsv.split(",") : []);

  function toggle(id: string, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosenCsv([...next].sort().join(","));
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        You haven&apos;t created any Service Groups yet, so this module is visible to everyone signed in.
      </p>
    );
  }

  return (
    <form action={action} {...dirtyProps} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={moduleId} />
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <label key={g.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="groupId"
              value={g.id}
              checked={chosen.has(g.id)}
              onChange={(e) => toggle(g.id, e.target.checked)}
            />
            {g.name}
          </label>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {chosen.size === 0
          ? "Currently visible to every signed-in user."
          : `Currently limited to ${chosen.size} group${chosen.size === 1 ? "" : "s"}.`}
      </p>
      <SaveBar
        dirty={dirty}
        pending={pending}
        success={state.ok ? "Saved." : null}
        error={state.error}
        label="Save visibility"
      />
    </form>
  );
}
