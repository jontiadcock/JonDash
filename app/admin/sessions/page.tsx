import { requirePermission } from "@/lib/auth/guards";
import { getCurrentSession } from "@/lib/auth/session";
import { listAllSessions } from "@/lib/sessions";
import { listSettings } from "@/lib/settings";
import { SessionsList } from "@/app/components/sessions-list";
import { SettingsForm } from "@/app/admin/settings/ui";
import { revokeSessionAction, saveSessionSettingsAction } from "./actions";

// Security-sensitive listing; never statically cached.
export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  await requirePermission("sessions.manage");
  const current = await getCurrentSession();
  const sessions = await listAllSessions(current?.id ?? null);
  const settings = await listSettings("sessions");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Active sessions</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Every signed-in device across all accounts. Revoke anything suspicious — the user
          will have to sign in again.
        </p>
      </section>

      <SessionsList sessions={sessions} revokeAction={revokeSessionAction} showUser />

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Session settings</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          How long sign-ins stay valid, and when idle sessions are signed out.
        </p>
        <SettingsForm settings={settings} action={saveSessionSettingsAction} saveLabel="Save session settings" />
      </section>
    </div>
  );
}
