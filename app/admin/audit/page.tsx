import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { pruneAuditLog } from "@/lib/audit";
import { listSettings } from "@/lib/settings";
import { formatWhen } from "@/lib/format";
import { SettingsForm } from "@/app/admin/settings/ui";
import { saveAuditSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; userId?: string; page?: string }>;
}) {
  await requirePermission("audit.view");

  // Apply retention on view (best-effort, no-op when retention is "keep forever").
  await pruneAuditLog();

  const auditSettings = await listSettings("audit");
  const sp = await searchParams;
  const actionFilter = sp.action?.trim() || "";
  const userFilter = sp.userId?.trim() || "";
  const page = Math.max(1, Number(sp.page) || 1);

  // "Who" is a user id, except for the one actor that isn't a user: the scheduler.
  // Answering "what ran overnight without anyone touching it" is the main reason to
  // record `source` at all, so it needs to be filterable, not just visible.
  const SYSTEM = "__system";
  const where = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(userFilter === SYSTEM ? { source: "system" } : userFilter ? { userId: userFilter } : {}),
  };

  const [total, events, actions, users] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.user.findMany({ select: { id: true, email: true }, orderBy: { email: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (actionFilter) qs.set("action", actionFilter);
    if (userFilter) qs.set("userId", userFilter);
    qs.set("page", String(p));
    return `/admin/audit?${qs.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Security-relevant events. {total} matching · showing page {clampedPage} of {totalPages}.
        </p>
      </section>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="action">Action</label>
          <select id="action" name="action" defaultValue={actionFilter} className="input">
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>{a.action}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="userId">User</label>
          <select id="userId" name="userId" defaultValue={userFilter} className="input">
            <option value="">All users</option>
            <option value={SYSTEM}>System (scheduled)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Filter</button>
        {(actionFilter || userFilter) && (
          <Link href="/admin/audit" className="btn btn-ghost text-sm">Clear</Link>
        )}
      </form>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">IP</th>
                <th className="px-5 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-5 py-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatWhen(e.createdAt)}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{e.action}</td>
                  <td className="px-5 py-3">
                    {e.user?.email ??
                      (e.source === "system" ? (
                        // "The schedule did this" must not look like "we don't know who did
                        // this" — those are very different answers in a security log.
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                          title="Ran on a schedule — no signed-in user"
                        >
                          System
                        </span>
                      ) : (
                        "—"
                      ))}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{e.ip ?? "—"}</td>
                  <td className="px-5 py-3" style={{ color: "var(--muted)" }}>{e.detail ?? "—"}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No audit events match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          {clampedPage > 1 ? (
            <Link href={pageHref(clampedPage - 1)} className="btn btn-ghost text-sm">← Newer</Link>
          ) : <span />}
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Page {clampedPage} of {totalPages}
          </span>
          {clampedPage < totalPages ? (
            <Link href={pageHref(clampedPage + 1)} className="btn btn-ghost text-sm">Older →</Link>
          ) : <span />}
        </div>
      )}

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Audit settings</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          How long audit events are kept before they’re automatically deleted.
        </p>
        <SettingsForm settings={auditSettings} action={saveAuditSettingsAction} saveLabel="Save audit settings" />
      </section>
    </div>
  );
}
