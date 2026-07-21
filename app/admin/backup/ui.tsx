"use client";

import { useActionState, useState } from "react";
import { importBackupAction, type ImportState } from "./actions";

// Mirrors lib/backup BACKUP_CATEGORIES + CATEGORY_LABELS (can't import a server-only
// module into a client component). The server restores only what's actually present.
const RESTORE_CATEGORIES: { value: string; label: string }[] = [
  { value: "users", label: "Users & accounts" },
  { value: "roles", label: "Service groups & shared services" },
  { value: "access-roles", label: "Access roles (delegated admin)" },
  { value: "settings", label: "Settings" },
  { value: "config", label: "Server configuration (network, HTTPS, updates)" },
  { value: "icons", label: "Icons" },
  { value: "audit", label: "Audit log" },
];

/** Client mirror of validateBackupPassphrase (server enforces the real check). */
function passphraseIssue(p: string): string | null {
  if (!p) return null; // empty = unencrypted, allowed
  if (p.length < 12) return "At least 12 characters.";
  if (!/[A-Z]/.test(p)) return "Add an uppercase letter.";
  if (!/[0-9]/.test(p)) return "Add a number.";
  if (!/[^A-Za-z0-9]/.test(p)) return "Add a symbol.";
  return null;
}

export function ExportForm() {
  const [passphrase, setPassphrase] = useState("");
  const hasPass = passphrase.trim().length > 0;
  const issue = passphraseIssue(passphrase.trim());

  return (
    <form method="post" action="/api/backup/export" className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Downloads a <strong>full</strong> backup of this server — all accounts, service groups, access
        roles, settings, network/HTTPS configuration, icons and the audit log.
      </p>

      <div>
        <label className="label" htmlFor="export-pass">
          Passphrase <span style={{ color: "var(--muted)" }}>(optional, but recommended)</span>
        </label>
        <input
          id="export-pass"
          name="passphrase"
          type="password"
          autoComplete="new-password"
          className="input"
          placeholder="Encrypts the file and includes credentials + keys"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        {hasPass && issue ? (
          <p className="form-error mt-1">{issue} (12+ chars, with an uppercase letter, a number and a symbol.)</p>
        ) : (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {hasPass
              ? "Encrypted (AES-256): includes sign-in credentials, 2FA secrets, email settings and the encryption key — a full, migratable backup. Keep the passphrase safe; it can’t be recovered."
              : "No passphrase → an unencrypted backup that omits the encryption key, credentials and secret settings. Restoring users from it means they must set up their sign-in again."}
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary self-start" disabled={hasPass && !!issue}>
        Download full backup
      </button>
    </form>
  );
}

const initialImport: ImportState = {};

export function ImportForm({ needsTotp }: { needsTotp: boolean }) {
  const [state, action, pending] = useActionState(importBackupAction, initialImport);
  const [confirmText, setConfirmText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(RESTORE_CATEGORIES.map((c) => [c.value, true])),
  );
  const anySelected = Object.values(selected).some(Boolean);

  if (state.success) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm" style={{ color: "var(--primary)" }}>{state.success}</p>
        {state.notices?.map((n, i) => (
          <p key={i} className="text-sm" style={{ color: "var(--muted)" }}>{n}</p>
        ))}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div
        className="rounded-lg p-3 text-sm"
        style={{ background: "color-mix(in srgb, #dc2626 12%, transparent)", color: "#b91c1c" }}
      >
        <strong>This replaces the data you select.</strong> Each chosen category is erased and replaced
        from the backup — this cannot be undone. Restoring <strong>Users</strong> from an encrypted
        backup also adopts that backup’s encryption key (so 2FA works) and signs everyone out.
      </div>

      <div>
        <label className="label" htmlFor="import-file">
          Backup file <span style={{ color: "var(--muted)" }}>(.zip archive)</span>
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".zip,application/zip"
          required
          className="input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && f.size > 10 * 1024 * 1024) {
              setFileError("That backup file is too large (10 MB max).");
              e.target.value = "";
            } else {
              setFileError(null);
            }
          }}
        />
        {fileError && <p className="form-error mt-1">{fileError}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">What to restore</legend>
        <p className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
          Only items actually present in the backup are restored; the rest are ignored.
        </p>
        {RESTORE_CATEGORIES.map((c) => (
          <label key={c.value} className="flex items-center gap-3 rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
            <input
              type="checkbox"
              name="categories"
              value={c.value}
              checked={!!selected[c.value]}
              onChange={(e) => setSelected((s) => ({ ...s, [c.value]: e.target.checked }))}
            />
            <span className="text-sm">{c.label}</span>
          </label>
        ))}
      </fieldset>

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
          placeholder="Leave blank for unencrypted backups"
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
        disabled={pending || confirmText !== "Everything" || !!fileError || !anySelected}
      >
        {pending ? "Restoring…" : "Erase & restore"}
      </button>
    </form>
  );
}
