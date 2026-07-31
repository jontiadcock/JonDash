"use client";

import { useActionState, useState, useTransition } from "react";
import {
  welcomeCreateAction,
  welcomeConfirmAction,
  welcomeRestoreAction,
  welcomeInspectAction,
  type WelcomeState,
  type WelcomeRestoreState,
} from "./actions";
import type { BackupInspection } from "@/lib/backup";

const initial: WelcomeState = {};
const restoreInitial: WelcomeRestoreState = {};

/** REFS app/welcome/page.tsx */
export function WelcomeCreateForm() {
  const [state, action, pending] = useActionState(welcomeCreateAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="email">
          Your email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" placeholder="you@example.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Create a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="input"
          placeholder="At least 12 characters"
        />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          At least 12 characters, using three of: lowercase, uppercase, numbers, symbols.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className="input" />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}

/**
 * First-run restore: reveal-on-demand form to initialise a fresh install from a
 * backup. Only rendered before any admin exists (the page enforces that).
 * REFS app/welcome/page.tsx
 */
export function WelcomeRestoreForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(welcomeRestoreAction, restoreInitial);
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [inspecting, startInspect] = useTransition();
  const [passphrase, setPassphrase] = useState("");
  const encrypted = inspection?.ok === true && inspection.encrypted;

  if (!open) {
    return (
      <button
        type="button"
        className="text-sm underline"
        style={{ color: "var(--muted)" }}
        onClick={() => setOpen(true)}
      >
        Migrating from another machine? Restore from a backup instead
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="restore-file">
          Backup file <span style={{ color: "var(--muted)" }}>(.dashbk, or an older .zip)</span>
        </label>
        <input
          id="restore-file"
          name="file"
          type="file"
          // BUG-58, same as the admin restore: `application/octet-stream` matched every unknown
          // binary and cancelled the specific entries, so the picker filtered nothing at all.
          accept=".dashbk,.zip,application/zip"
          required
          className="input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setInspection(null);
            setPassphrase("");
            if (!f || f.size > 10 * 1024 * 1024) return;
            // The same detection as the admin restore — this screen is where someone is most
            // likely holding a file made months ago on another machine.
            const fd = new FormData();
            fd.set("file", f);
            startInspect(async () => setInspection(await welcomeInspectAction(fd)));
          }}
        />
        {inspecting && (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Checking the file…
          </p>
        )}
        {inspection?.ok === false && <p className="form-error mt-1">{inspection.error}</p>}
        {inspection?.ok === true && (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {inspection.encrypted ? "Encrypted backup" : "Unencrypted backup"}
            {inspection.exportedAt ? ` made ${new Date(inspection.exportedAt).toLocaleString()}` : ""}.
          </p>
        )}
      </div>

      {encrypted && (
        <div>
          <label className="label" htmlFor="restore-pass">
            Passphrase for this backup
          </label>
          <input
            id="restore-pass"
            name="passphrase"
            type="password"
            autoComplete="off"
            className="input"
            required
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="The passphrase this backup was made with"
          />
        </div>
      )}

      {inspection?.ok === true && !inspection.encrypted && (
        <p className="text-sm" style={{ color: "var(--warning)" }}>
          This backup isn&apos;t encrypted, so it carries no passwords or 2FA — everyone it restores,
          including you, will have to set up their sign-in again afterwards.
        </p>
      )}
      {state.error && <p className="form-error">{state.error}</p>}
      {state.notice && (
        <p className="text-sm" style={{ color: "var(--primary)" }}>
          {state.notice}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Restoring…" : "Restore backup"}
        </button>
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** REFS app/welcome/page.tsx */
export function WelcomeConfirmForm({
  qrDataUrl,
  secret,
}: {
  qrDataUrl: string;
  secret: string;
}) {
  const [state, action, pending] = useActionState(welcomeConfirmAction, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
        <p className="label mb-3">Set up two-factor authentication</p>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="TOTP QR code" width={132} height={132} className="rounded-lg bg-white p-1" />
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            <p>Scan with Google Authenticator, Authy, 1Password, etc.</p>
            <p className="mt-2">Or enter this key manually:</p>
            <code className="mt-1 block break-all font-mono text-[11px]">{secret}</code>
          </div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="code">
          Enter the 6-digit code to confirm
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="input tracking-[0.4em] text-center text-lg"
          placeholder="000000"
        />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Finishing…" : "Finish setup"}
      </button>
    </form>
  );
}
