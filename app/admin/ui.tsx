"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createUserAction,
  resetAccessAction,
  createLinkAction,
  updateLinkAction,
  createRoleAction,
  renameRoleAction,
  createRoleLinkAction,
  type AdminState,
} from "./actions";
import { ConfirmDialog } from "@/app/components/confirm-dialog";

const initial: AdminState = {};

const MAX_ICON_BYTES = 2 * 1024 * 1024; // keep in sync with lib/security/upload.ts

/**
 * Icon file input with a client-side size pre-check: an oversized image shows a
 * friendly message and is cleared before submit, so it never hits the server and
 * can't trigger a body-size (413) crash. The server-side cap stays authoritative.
 */
function IconFileInput({ id, name = "icon" }: { id?: string; name?: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <input
        id={id}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && f.size > MAX_ICON_BYTES) {
            setError("Image must be 2 MB or smaller.");
            e.target.value = "";
          } else {
            setError(null);
          }
        }}
      />
      {error && <p className="form-error mt-1">{error}</p>}
    </>
  );
}

export function SetupLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="mt-3 rounded-lg p-3 text-sm"
      style={{ background: "var(--surface-2)" }}
    >
      <p className="mb-2 font-medium">One-time setup link — share it with the user now:</p>
      <div className="flex gap-2">
        <input readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard may be unavailable */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        This link is shown once and expires in 7 days.
      </p>
    </div>
  );
}

export function CreateUserForm({ isAdmin = true }: { isAdmin?: boolean }) {
  const [state, action, pending] = useActionState(createUserAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok, state.setupUrl]);

  return (
    <div>
      <form ref={ref} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="new-email">
            Email
          </label>
          <input id="new-email" name="email" type="email" required className="input" placeholder="user@example.com" />
        </div>
        <div>
          <label className="label" htmlFor="new-role">
            Role
          </label>
          <select id="new-role" name="role" className="input" defaultValue="USER">
            <option value="USER">User</option>
            {isAdmin && <option value="ADMIN">Admin</option>}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create user"}
        </button>
      </form>
      {state.error && <p className="form-error mt-2">{state.error}</p>}
      {state.setupUrl && <SetupLinkBox url={state.setupUrl} />}
    </div>
  );
}

export function ResetAccessForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetAccessAction, initial);
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <ConfirmSubmit
          className="btn btn-danger"
          pending={pending}
          confirmLabel="Reset access"
          message="Reset this user's access? Their password and 2FA will be cleared and all sessions ended."
        >
          {pending ? "Resetting…" : "Reset access"}
        </ConfirmSubmit>
      </form>
      {state.error && <p className="form-error mt-2">{state.error}</p>}
      {state.setupUrl && <SetupLinkBox url={state.setupUrl} />}
    </div>
  );
}

export function CreateLinkForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(createLinkAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-3" encType="multipart/form-data">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="link-title">
            Service name
          </label>
          <input id="link-title" name="title" required maxLength={80} className="input" placeholder="e.g. Email" />
        </div>
        <div>
          <label className="label" htmlFor="link-url">
            URL
          </label>
          <input id="link-url" name="url" type="url" required className="input" placeholder="https://…" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="link-icon">
          Icon (PNG, JPEG, WebP or GIF — optional, max 2 MB)
        </label>
        <IconFileInput id="link-icon" />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add service"}
        </button>
      </div>
    </form>
  );
}

export function EditLinkForm({
  link,
}: {
  link: { id: string; title: string; url: string };
}) {
  const [state, action, pending] = useActionState(updateLinkAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost !py-1 !px-2 text-xs" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 flex w-full flex-col gap-3" encType="multipart/form-data">
      <input type="hidden" name="id" value={link.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Service name</label>
          <input name="title" required maxLength={80} defaultValue={link.title} className="input" />
        </div>
        <div>
          <label className="label">URL</label>
          <input name="url" type="url" required defaultValue={link.url} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Replace icon (optional)</label>
        <IconFileInput />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary !py-1.5 text-sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ConfirmSubmit({
  children,
  message,
  className,
  confirmLabel = "Confirm",
  pending,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  confirmLabel?: string;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        message={message}
        confirmLabel={confirmLabel}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          // Submit the owning form, which carries the server action.
          btnRef.current?.form?.requestSubmit();
        }}
      />
    </>
  );
}

export function CreateRoleForm() {
  const [state, action, pending] = useActionState(createRoleAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <div>
      <form ref={ref} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="role-name">
            Service group name
          </label>
          <input id="role-name" name="name" required maxLength={60} className="input" placeholder="e.g. Sales team" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create service group"}
        </button>
      </form>
      {state.error && <p className="form-error mt-2">{state.error}</p>}
    </div>
  );
}

export function RenameRoleForm({ role }: { role: { id: string; name: string } }) {
  const [state, action, pending] = useActionState(renameRoleAction, initial);
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
        <label className="label">Service group name</label>
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

export function CreateRoleLinkForm({ roleId }: { roleId: string }) {
  const [state, action, pending] = useActionState(createRoleLinkAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-3" encType="multipart/form-data">
      <input type="hidden" name="roleId" value={roleId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rl-title">
            Service name
          </label>
          <input id="rl-title" name="title" required maxLength={80} className="input" placeholder="e.g. CRM" />
        </div>
        <div>
          <label className="label" htmlFor="rl-url">
            URL
          </label>
          <input id="rl-url" name="url" type="url" required className="input" placeholder="https://…" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="rl-icon">
          Icon (PNG, JPEG, WebP or GIF — optional, max 2 MB)
        </label>
        <IconFileInput id="rl-icon" />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add service"}
        </button>
      </div>
    </form>
  );
}
