"use client";

/**
 * The consequences of an action that restarts the server, stated before it happens.
 *
 * Installing, importing or uninstalling a module recompiles the app, so the server goes
 * down for the length of a build. Sessions survive it — a module rebuild is a graceful
 * restart now — but the dashboard is briefly unreachable, which is still a surprising
 * amount to happen from one click, so it's spelled out at the point of confirmation.
 * REFS app/admin/modules/browse/[id]/module-actions.tsx
 *      app/admin/modules/browse/queued-install-bar.tsx · app/admin/modules/helper-gap-notice.tsx
 *      app/admin/modules/import-form.tsx · app/admin/modules/ui.tsx
 *      app/admin/updates/available-updates.tsx
 */
export function RestartWarning({ what }: { what: string }) {
  return (
    <div
      className="rounded-lg border p-3 text-sm"
      style={{
        borderColor: "var(--warning, var(--border-strong))",
        background: "color-mix(in srgb, var(--warning, #c07a12) 8%, transparent)",
      }}
    >
      <p className="font-medium">{what}</p>
      <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5" style={{ color: "var(--muted)" }}>
        <li>JonDash will rebuild and restart — usually well under a minute, but longer on a slow machine.</li>
        <li>
          <strong>The dashboard will be briefly unreachable</strong> while it rebuilds. You stay signed in
          and come straight back once it&apos;s up.
        </li>
        <li>If a module stops the app building, JonDash removes it, starts up without it, and tells you.</li>
      </ul>
    </div>
  );
}
