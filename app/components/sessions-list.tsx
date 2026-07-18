import { formatWhen } from "@/lib/format";

export type SessionRow = {
  id: string;
  ip: string | null;
  location: string | null;
  device: string;
  lastSeenAt: Date;
  current: boolean;
  userEmail?: string;
};

/**
 * Presentational sessions table. `revokeAction` is a server action that reads a
 * `sessionId` field. When `showUser` is set, an owner column is rendered (admin).
 */
export function SessionsList({
  sessions,
  revokeAction,
  showUser = false,
}: {
  sessions: SessionRow[];
  revokeAction: (formData: FormData) => void | Promise<void>;
  showUser?: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <div className="card p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
        No active sessions.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--muted)" }} className="text-left">
              {showUser && <th className="px-5 py-3 font-medium">User</th>}
              <th className="px-5 py-3 font-medium">Device</th>
              <th className="px-5 py-3 font-medium">Location</th>
              <th className="px-5 py-3 font-medium">IP</th>
              <th className="px-5 py-3 font-medium">Last active</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                {showUser && <td className="px-5 py-3">{s.userEmail}</td>}
                <td className="px-5 py-3 font-medium">
                  {s.device}
                  {s.current && (
                    <span
                      className="ml-2 rounded px-1.5 py-0.5 text-xs"
                      style={{ background: "var(--surface-2)", color: "var(--primary)" }}
                    >
                      This device
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">{s.location ?? "—"}</td>
                <td className="px-5 py-3 font-mono text-xs">{s.ip ?? "—"}</td>
                <td className="px-5 py-3" style={{ color: "var(--muted)" }}>
                  {formatWhen(s.lastSeenAt)}
                </td>
                <td className="px-5 py-3 text-right">
                  <form action={revokeAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button
                      type="submit"
                      className="btn btn-ghost !py-1.5 !px-3 text-sm"
                      style={{ color: "#dc2626" }}
                    >
                      {s.current ? "Sign out" : "Revoke"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
