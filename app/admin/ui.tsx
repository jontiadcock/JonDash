"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createUserAction,
  createServiceAccountAction,
  resetAccessAction,
  createLinkAction,
  updateLinkAction,
  createRoleAction,
  renameRoleAction,
  createRoleLinkAction,
  type AdminState,
} from "./actions";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { SaveBar, selectSync, useFormDirty, useServerValue } from "@/app/components/save-bar";

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

/**
 * One form for both kinds of account, switched by a **type** selector (owner, 2026-07-27).
 *
 * They were two separate cards at first, on the reasoning that a checkbox on the user form is one
 * somebody eventually ticks by mistake. A *type selector* isn't that: it's an explicit choice with
 * no default drift, and one place to look beats two cards that share a purpose. The fields swap
 * with it rather than being disabled, so the form never shows a box that doesn't apply — a service
 * account has no email to type (the handle is generated) and a person has no name field.
 */
export function CreateUserForm({ isAdmin = true }: { isAdmin?: boolean }) {
  const [kind, setKind] = useState<"person" | "service">("person");
  const isService = kind === "service";

  // Two actions behind one form. Deliberately NOT one action with a flag: creating a login and
  // creating a thing-that-can-never-be-a-login have different invariants, and the service path
  // must never be reachable by a payload that merely omits a field.
  const [personState, personAction, personPending] = useActionState(createUserAction, initial);
  const [svcState, svcAction, svcPending] = useActionState(createServiceAccountAction, initial);

  const state = isService ? svcState : personState;
  const pending = isService ? svcPending : personPending;
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok, state.setupUrl]);

  return (
    <div>
      <form
        ref={ref}
        action={isService ? svcAction : personAction}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div>
          <label className="label" htmlFor="new-kind">
            Type
          </label>
          <select
            id="new-kind"
            className="input"
            value={kind}
            {...selectSync((v) => setKind(v as "person" | "service"))}
          >
            <option value="person">Person</option>
            <option value="service">Service account</option>
          </select>
        </div>

        {isService ? (
          <div className="flex-1">
            <label className="label" htmlFor="new-name">
              Name
            </label>
            <input
              id="new-name"
              name="displayName"
              type="text"
              required
              minLength={2}
              maxLength={60}
              className="input"
              placeholder="e.g. AI assistant"
            />
          </div>
        ) : (
          <div className="flex-1">
            <label className="label" htmlFor="new-email">
              Email
            </label>
            <input id="new-email" name="email" type="email" required className="input" placeholder="user@example.com" />
          </div>
        )}

        <div>
          <label className="label" htmlFor="new-role">
            {isService ? "Access" : "Role"}
          </label>
          <select id="new-role" name="role" className="input" defaultValue="USER">
            <option value="USER">User</option>
            {isAdmin && <option value="ADMIN">Admin</option>}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : isService ? "Create service account" : "Create user"}
        </button>
      </form>

      {isService && (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          An identity for an add-on to act as. It holds permissions and appears in the audit log, but{" "}
          <strong>nobody can ever sign in as it</strong> — and its key is issued by the add-on, not
          here. JonDash never sees it.
        </p>
      )}
      {state.error && <p className="form-error mt-2">{state.error}</p>}
      {isService && state.ok && (
        <p className="mt-2 text-sm" style={{ color: "var(--primary)" }}>
          Created. Point an add-on at it — there is nothing to send anyone.
        </p>
      )}
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

/**
 * The expanded "edit service" form. Rendered full-width *below* its list row (the
 * open state is owned by the row in link-list.tsx) so it stacks vertically instead
 * of being crammed into the horizontal controls, which overflowed on mobile (BUG-13).
 */
export function EditLinkFields({
  link,
  onDone,
}: {
  link: { id: string; title: string; url: string };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateLinkAction, initial);
  const { dirty, dirtyProps, generation } = useFormDirty(state);
  const [title, setTitle] = useServerValue(link.title);
  const [url, setUrl] = useServerValue(link.url);

  return (
    <form action={action} {...dirtyProps} className="mt-3 flex w-full flex-col gap-3" encType="multipart/form-data">
      <input type="hidden" name="id" value={link.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Service name</label>
          <input
            name="title"
            required
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">URL</label>
          <input
            name="url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Replace icon (optional)</label>
        {/* Keyed so the chosen file clears after a save — this form cancels React's post-action
            reset (see save-bar.tsx), and that reset is what used to clear it. */}
        <IconFileInput key={`icon-${generation}`} />
      </div>
      <SaveBar dirty={dirty} pending={pending} error={state.error} label="Save">
        <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={onDone}>
          Cancel
        </button>
      </SaveBar>
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
  const { dirty, dirtyProps } = useFormDirty(state);
  const [name, setName] = useServerValue(role.name);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        Rename
      </button>
    );
  }

  return (
    <form action={action} {...dirtyProps} className="flex items-end gap-2">
      <input type="hidden" name="id" value={role.id} />
      <div>
        <label className="label">Service group name</label>
        <input
          name="name"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
        />
      </div>
      <SaveBar dirty={dirty} pending={pending} label="Save">
        <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </SaveBar>
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
