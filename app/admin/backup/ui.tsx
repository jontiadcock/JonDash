"use client";

import { useActionState, useState } from "react";
import { importBackupAction, type ImportState } from "./actions";

const CATEGORIES: { value: string; label: string; hint: string; needsPassphrase?: boolean }[] = [
  { value: "roles", label: "Roles & shared services", hint: "Service bundles and their tiles" },
  { value: "users", label: "Users & accounts", hint: "Accounts + credentials — requires a passphrase", needsPassphrase: true },
  { value: "icons", label: "Icons", hint: "Uploaded tile images" },
  { value: "audit", label: "Audit log", hint: "Security event history" },
];

export function ExportForm() {
  const [passphrase, setPassphrase] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({ roles: true, icons: true });
  const hasPass = passphrase.trim().length > 0;
  const anySelected = Object.values(checked).some(Boolean);
  // Users can't be exported without a passphrase.
  const usersSelectedWithoutPass = checked.users && !hasPass;

  return (
    <form method="post" action="/api/backup/export" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {CATEGORIES.map((c) => {
          const disabled = c.needsPassphrase && !hasPass;
          return (
            <label
              key={c.value}
              className="flex items-start gap-3 rounded-lg p-3"
              style={{ background: "var(--surface-2)", opacity: disabled ? 0.55 : 1 }}
            >
              <input
                type="checkbox"
                name="categories"
                value={c.value}
                className="mt-1"
                checked={!!checked[c.value] && !disabled}
                disabled={disabled}
                onChange={(e) => setChecked((s) => ({ ...s, [c.value]: e.target.checked }))}
              />
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs" style={{ color: "var(--muted)" }}>
                  {c.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div>
        <label className="label" htmlFor="export-pass">
          Passphrase <span style={{ color: "var(--muted)" }}>(required to include accounts)</span>
        </label>
        <input
          id="export-pass"
          name="passphrase"
          type="password"
          autoComplete="new-password"
          className="input"
          placeholder="Encrypts the whole file if set"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {hasPass
            ? "The backup file will be encrypted (AES-256). Keep this passphrase safe — it can’t be recovered."
            : "No passphrase: the file will be plain JSON and cannot include user accounts."}
        </p>
      </div>

      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={!anySelected || usersSelectedWithoutPass}
      >
        Download backup
      </button>
    </form>
  );
}

const initialImport: ImportState = {};

export function ImportForm({ needsTotp }: { needsTotp: boolean }) {
  const [state, action, pending] = useActionState(importBackupAction, initialImport);
  const [confirmText, setConfirmText] = useState("");

  if (state.success) {
    return <p className="text-sm" style={{ color: "var(--primary)" }}>{state.success}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div
        className="rounded-lg p-3 text-sm"
        style={{ background: "color-mix(in srgb, #dc2626 12%, transparent)", color: "#b91c1c" }}
      >
        <strong>This replaces your current data.</strong> Everything in the categories inside the
        backup file (users, roles, services, etc.) will be erased and replaced. This cannot be undone.
      </div>

      <div>
        <label className="label" htmlFor="import-file">
          Backup file
        </label>
        <input id="import-file" name="file" type="file" accept="application/json,.json" required className="input" />
      </div>

      <div>
        <label className="label" htmlFor="import-pass">
          Passphrase <span style={{ color: "var(--muted)" }}>(only if the file is encrypted)</span>
        </label>
        <input
          id="import-pass"
          name="passphrase"
          type="password"
          autoComplete="off"
          className="input"
          placeholder="Leave blank for plain backups"
        />
      </div>

      {needsTotp && (
        <div>
          <label className="label" htmlFor="import-totp">
            Authenticator code <span style={{ color: "var(--muted)" }}>(security re-check)</span>
          </label>
          <input
            id="import-totp"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            className="input tracking-[0.3em] text-center"
            placeholder="000000"
          />
        </div>
      )}

      <div>
        <label className="label" htmlFor="import-confirm">
          Type <code className="font-mono">Everything</code> to confirm
        </label>
        <input
          id="import-confirm"
          name="confirm"
          className="input"
          placeholder="Everything"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
      </div>

      {state.error && <p className="form-error">{state.error}</p>}

      <button
        type="submit"
        className="btn self-start"
        style={{ background: "#dc2626", color: "white" }}
        disabled={pending || confirmText !== "Everything"}
      >
        {pending ? "Restoring…" : "Erase & restore"}
      </button>
    </form>
  );
}
