import { requirePermission } from "@/lib/auth/guards";
import { hasRecentTotp } from "@/lib/auth/stepup";
import { ExportForm, ImportForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminBackupPage() {
  await requirePermission("backups.manage");
  const recentTotp = await hasRecentTotp();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Backup &amp; restore</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Export a copy of your data, or restore from a previous backup.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Export</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Choose what to include. Accounts and credentials can only be exported in an
          encrypted (passphrase-protected) file.
        </p>
        <ExportForm />
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Restore</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Restoring replaces your current data with the contents of the backup file.
        </p>
        <ImportForm needsTotp={!recentTotp} />
      </section>
    </div>
  );
}
