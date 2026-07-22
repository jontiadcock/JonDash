"use client";

import { useActionState } from "react";
import { dismissFailedModuleAction, type InstallState } from "./actions";

/**
 * Shown when the launcher had to remove a module to get JonDash running again. Without
 * this the recovery is invisible: the app would just come back up with the module quietly
 * missing, and the admin would have no idea why.
 */
export function FailedModuleNotice({ moduleId, at }: { moduleId: string; at: string }) {
  const [, action, pending] = useActionState<InstallState, FormData>(dismissFailedModuleAction, {});
  const when = at ? new Date(at) : null;
  // A batch install removes every module in the batch, since a failed build gives no way
  // to tell which one caused it.
  const ids = moduleId.split(",").map((s) => s.trim()).filter(Boolean);
  const many = ids.length > 1;

  return (
    <div
      className="rounded-xl border p-4 text-sm"
      style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}
    >
      <p>
        <strong>
          {ids.map((id) => `“${id}”`).join(", ")} {many ? "were" : "was"} removed automatically.
        </strong>{" "}
        {many ? "They" : "It"} stopped JonDash from building
        {when && !Number.isNaN(when.getTime()) ? ` on ${when.toLocaleString()}` : ""}, so{" "}
        {many ? "they were" : "it was"} uninstalled and the app rebuilt without{" "}
        {many ? "them" : "it"}. Your data and settings weren&apos;t touched.
      </p>
      <p className="mt-1" style={{ color: "var(--muted)" }}>
        {many
          ? "Modules installed together are removed together, because a failed build doesn't say which one caused it — try installing them one at a time to find the culprit."
          : "This usually means the module has a fault or isn't compatible with this JonDash version — check with whoever published it before installing it again."}{" "}
        <code>logs\</code> has the build output.
      </p>
      <form action={action} className="mt-2">
        <button type="submit" className="btn btn-ghost !py-1.5 text-sm" disabled={pending}>
          Dismiss
        </button>
      </form>
    </div>
  );
}
