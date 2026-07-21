"use client";

import { useActionState } from "react";
import { importModuleAction, type InstallState } from "./actions";

/**
 * Import your own module from a .zip — the sideload path, for a module you wrote (or had
 * an AI write) rather than one published by a source. It goes through exactly the same
 * verification as a source install: importing skips the source, not the checks.
 */
export function ImportModuleForm() {
  const [state, action, pending] = useActionState<InstallState, FormData>(importModuleAction, {});

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div>
        <h2 className="font-medium">Import your own module</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          A <code>.zip</code> containing the module folder (with its <code>module.ts</code> inside). It is
          checked against the same safety rules as a module from a source — anything that reaches for a
          permission it didn&apos;t declare, touches the filesystem, or runs constructed code is refused.
          JonDash rebuilds and restarts afterwards.
        </p>
      </div>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="package"
          accept=".zip,application/zip"
          required
          className="text-sm"
          style={{ color: "var(--muted)" }}
        />
        <button type="submit" className="btn btn-ghost !py-1.5 text-sm" disabled={pending}>
          {pending ? "Checking…" : "Import module"}
        </button>
      </form>
      {state.error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
