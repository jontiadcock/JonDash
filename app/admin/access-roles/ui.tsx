"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createAccessRoleAction,
  renameAccessRoleAction,
  setAccessRolePermissionsAction,
  type AccessRoleState,
} from "./actions";

const initial: AccessRoleState = {};

export function CreateAccessRoleForm() {
  const [state, action, pending] = useActionState(createAccessRoleAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <div>
      <form ref={ref} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="ar-name">
            Access role name
          </label>
          <input id="ar-name" name="name" required maxLength={60} className="input" placeholder="e.g. Help desk" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create access role"}
        </button>
      </form>
      {state.error && <p className="form-error mt-2">{state.error}</p>}
    </div>
  );
}

export function RenameAccessRoleForm({ role }: { role: { id: string; name: string } }) {
  const [state, action, pending] = useActionState(renameAccessRoleAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        Rename
      </button>
    );
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="id" value={role.id} />
      <div>
        <label className="label">Access role name</label>
        <input name="name" required maxLength={60} defaultValue={role.name} className="input" />
      </div>
      <button type="submit" className="btn btn-primary !py-1.5 text-sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.error && <p className="form-error">{state.error}</p>}
    </form>
  );
}

export function AccessRolePermissionsForm({
  roleId,
  permissions,
  assigned,
}: {
  roleId: string;
  permissions: { key: string; label: string }[];
  assigned: string[];
}) {
  const [state, action, pending] = useActionState(setAccessRolePermissionsAction, initial);
  const assignedSet = new Set(assigned);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={roleId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {permissions.map((p) => (
          <label
            key={p.key}
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "var(--surface-2)" }}
          >
            <input
              type="checkbox"
              name="permissions"
              value={p.key}
              defaultChecked={assignedSet.has(p.key)}
              className="h-4 w-4"
            />
            <span className="text-sm">{p.label}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
          {pending ? "Saving…" : "Save capabilities"}
        </button>
        {state.ok && (
          <span className="text-sm" style={{ color: "var(--primary)" }}>
            Saved.
          </span>
        )}
        {state.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
