import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getCurrentSession } from "@/lib/auth/session";
import { backupCodeStatus } from "@/lib/auth/backup-codes";
import { listUserSessions } from "@/lib/sessions";
import { SessionsList } from "@/app/components/sessions-list";
import { RegenerateBackupCodes, ChangePassword } from "./ui";
import { revokeOwnSessionAction } from "./actions";

// Account data is per-request and security-sensitive; never statically cached.
export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reenrolled?: string }>;
}) {
  const user = await requireUser();
  const { reenrolled } = await searchParams;
  const current = await getCurrentSession();
  const [{ remaining, total }, sessions] = await Promise.all([
    backupCodeStatus(user.id),
    listUserSessions(user.id, current?.id ?? null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your account</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {user.email}
        </p>
      </section>

      {reenrolled && (
        <div className="card p-4 text-sm" style={{ color: "var(--primary)" }}>
          Your authenticator was replaced successfully.
        </div>
      )}

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Password</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Change your password. This signs out your other sessions.
        </p>
        <ChangePassword />
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Authenticator app</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Moving to a new phone? Re-enrol your two-factor authenticator.
        </p>
        <Link href="/account/authenticator" className="btn btn-ghost !py-1.5 !px-3 text-sm self-start">
          Re-enrol authenticator
        </Link>
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Two-factor recovery codes</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          One-time codes to sign in if you lose your authenticator app.
        </p>
        <RegenerateBackupCodes remaining={remaining} total={total} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Active sessions</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Devices currently signed in to your account. Revoke any you don’t recognise.
        </p>
        <SessionsList sessions={sessions} revokeAction={revokeOwnSessionAction} />
      </section>
    </div>
  );
}
