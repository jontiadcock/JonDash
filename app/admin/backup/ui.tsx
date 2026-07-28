"use client";

import { useActionState, useState, useTransition } from "react";
import { importBackupAction, inspectBackupAction, type ImportState } from "./actions";
import type { BackupInspection } from "@/lib/backup";

/** Client mirror of validateBackupPassphrase (server enforces the real check). */
function passphraseIssue(p: string): string | null {
  if (!p) return null;
  if (p.length < 12) return "At least 12 characters.";
  if (!/[A-Z]/.test(p)) return "Add an uppercase letter.";
  if (!/[0-9]/.test(p)) return "Add a number.";
  if (!/[^A-Za-z0-9]/.test(p)) return "Add a symbol.";
  return null;
}

/**
 * What a backup contains, always on screen (9.3).
 *
 * **The list is the explanation.** Encryption used to be a passphrase box with a paragraph
 * underneath about what it changed; almost nobody read it, and the difference it makes is not a
 * nuance — an unencrypted backup cannot restore anyone's ability to sign in. Watching four more
 * rows appear the moment the box is ticked teaches that in a way the paragraph never did, which is
 * why the two lists are rendered together rather than swapped.
 */
const ALWAYS = [
  "User accounts, names and roles",
  "Service groups and their shared services",
  "Everyone's own service tiles and dashboard layouts",
  "Admin roles (delegated admin permissions)",
  "Settings",
  "Server configuration — network, HTTPS, update channel",
  "The audit log",
];

const ENCRYPTED_ONLY = [
  "Sign-in credentials (password hashes)",
  "Two-factor secrets and recovery codes",
  "This install's encryption key — what makes the two above usable again",
  "Secret settings, such as your email account password",
  "Service icons",
];

export function ExportForm() {
  const [encrypt, setEncrypt] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const issue = passphraseIssue(passphrase.trim());
  const blocked = encrypt && (!passphrase.trim() || !!issue);

  return (
    <form method="post" action="/api/backup/export" className="flex flex-col gap-5">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="encryptChecked"
          checked={encrypt}
          onChange={(e) => setEncrypt(e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Encrypt this backup</span>
          <span className="block text-sm" style={{ color: "var(--muted)" }}>
            Strongly recommended. Without it the file cannot carry anything that would let people
            sign in again, so a restore leaves every account locked out until each one is set up
            afresh.
          </span>
        </span>
      </label>

      <div>
        <label className="label" htmlFor="export-pass">
          Passphrase
        </label>
        <input
          id="export-pass"
          name="passphrase"
          type="password"
          autoComplete="new-password"
          className="input"
          disabled={!encrypt}
          style={!encrypt ? { opacity: 0.5 } : undefined}
          placeholder={encrypt ? "12+ characters, with a capital, a number and a symbol" : "Not used — encryption is off"}
          value={encrypt ? passphrase : ""}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        {encrypt && passphrase && issue ? (
          <p className="form-error mt-1">{issue}</p>
        ) : (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {encrypt
              ? "Keep it safe — it cannot be recovered, and without it the backup cannot be opened by anyone, including you."
              : "Turn encryption on to set a passphrase."}
          </p>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
        <p className="mb-2 text-sm font-medium">Included in this backup</p>
        <ul className="flex flex-col gap-1 text-sm" style={{ color: "var(--muted)" }}>
          {ALWAYS.map((item) => (
            <li key={item}>• {item}</li>
          ))}
          {ENCRYPTED_ONLY.map((item) => (
            <li
              key={item}
              style={{
                color: encrypt ? "var(--foreground)" : "var(--muted)",
                opacity: encrypt ? 1 : 0.45,
                textDecoration: encrypt ? undefined : "line-through",
              }}
            >
              • {item}
            </li>
          ))}
        </ul>
        {!encrypt && (
          <p className="mt-3 text-sm" style={{ color: "var(--warning)" }}>
            The struck-through items are left out of an unencrypted backup.
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary self-start" disabled={blocked}>
        Download backup
      </button>
    </form>
  );
}

const initialImport: ImportState = {};

export function ImportForm({ needsTotp }: { needsTotp: boolean }) {
  const [state, action, pending] = useActionState(importBackupAction, initialImport);
  const [fileError, setFileError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [inspecting, startInspect] = useTransition();
  const [passphrase, setPassphrase] = useState("");

  const encrypted = inspection?.ok === true && inspection.encrypted;
  const needsPass = encrypted && !passphrase.trim();

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
      {/*
        9.1 — the "type Everything" box is gone; this warning replaces it. It names the two things
        people are actually surprised by: that the whole install is replaced rather than merged,
        and that the SERVER's own configuration comes along with the data.
      */}
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          borderColor: "var(--danger)",
          background: "color-mix(in srgb, var(--danger) 10%, transparent)",
        }}
      >
        <p className="mb-1 font-semibold" style={{ color: "var(--danger)" }}>
          This replaces everything on this server.
        </p>
        <p style={{ color: "var(--foreground)" }}>
          Every account, service, group, setting and the audit log are erased and rewritten from the
          backup — including <strong>this server&apos;s own configuration</strong>: its network and
          HTTPS settings, ports, and update channel. It cannot be undone, and everyone signed in is
          signed out.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="import-file">
          Backup file <span style={{ color: "var(--muted)" }}>(.dashbk, or an older .zip)</span>
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          /*
           * BUG-58: this used to include `application/octet-stream`, which browsers hand to `.exe`
           * and most unknown binaries — so the broadest entry cancelled the specific ones and the
           * picker filtered nothing. `.dashbk` has no registered MIME type, so it must stay here by
           * extension; browsers match extension entries independently of MIME.
           */
          accept=".dashbk,.zip,application/zip"
          required
          className="input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setInspection(null);
            setPassphrase("");
            if (!f) return;
            if (f.size > 10 * 1024 * 1024) {
              setFileError("That backup file is too large (10 MB max).");
              e.target.value = "";
              return;
            }
            setFileError(null);
            // 9.5 — read the file's own envelope now, so the passphrase is asked for only when it
            // is genuinely needed, and asked for BEFORE committing to a destructive action.
            const fd = new FormData();
            fd.set("file", f);
            startInspect(async () => setInspection(await inspectBackupAction(fd)));
          }}
        />
        {fileError && <p className="form-error mt-1">{fileError}</p>}
        {inspecting && (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Checking the file…
          </p>
        )}
        {inspection?.ok === false && <p className="form-error mt-1">{inspection.error}</p>}
        {inspection?.ok === true && (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {inspection.encrypted ? "Encrypted backup" : "Unencrypted backup"}
            {inspection.exportedAt
              ? ` made ${new Date(inspection.exportedAt).toLocaleString()}`
              : ""}
            .
            {!inspection.encrypted &&
              " It carries no credentials, so everyone will need to set up their sign-in again."}
          </p>
        )}
      </div>

      {/* 9.5 — shown only when the file says it needs one, and then it is required, not optional. */}
      {encrypted && (
        <div>
          <label className="label" htmlFor="import-pass">
            Passphrase for this backup
          </label>
          <input
            id="import-pass"
            name="passphrase"
            type="password"
            autoComplete="off"
            className="input"
            required
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="The passphrase this backup was made with"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            This file is encrypted, so it can&apos;t be opened without it.
          </p>
        </div>
      )}

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

      {state.error && <p className="form-error">{state.error}</p>}

      <button
        type="submit"
        className="btn self-start"
        style={{ background: "var(--danger)", color: "white" }}
        disabled={pending || !!fileError || inspecting || inspection?.ok === false || needsPass}
      >
        {pending ? "Restoring…" : "Erase & restore"}
      </button>
    </form>
  );
}
