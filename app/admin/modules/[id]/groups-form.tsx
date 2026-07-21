"use client";

import { useActionState } from "react";
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
  const chosen = new Set(selected);

  if (groups.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        You haven&apos;t created any Service Groups yet, so this module is visible to everyone signed in.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={moduleId} />
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <label key={g.id} className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="groupId" value={g.id} defaultChecked={chosen.has(g.id)} />
            {g.name}
          </label>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {chosen.size === 0
          ? "Currently visible to every signed-in user."
          : `Currently limited to ${chosen.size} group${chosen.size === 1 ? "" : "s"}.`}
      </p>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-ghost self-start !py-1.5 text-sm" disabled={pending}>
          {pending ? "Saving…" : "Save visibility"}
        </button>
        {state.ok && <span className="text-sm" style={{ color: "var(--primary)" }}>Saved.</span>}
        {state.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
