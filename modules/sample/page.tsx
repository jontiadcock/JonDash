import type { ModulePageProps } from "@/lib/modules/types";

type Note = { id: number; text: string; createdAt: string };

/** The sample module's own page, served at /m/sample. Reads from its own table. */
export default async function SamplePage({ ctx }: ModulePageProps) {
  const heading = String((await ctx.settings.get("heading")) ?? "Notes");
  let notes: Note[] = [];
  if (ctx.db) {
    notes = await ctx.db.query<Note>(
      `SELECT id, text, createdAt FROM ${ctx.db.table("notes")} ORDER BY id DESC LIMIT 50`,
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Sample module — its data lives in its own <code>mod_sample_notes</code> table and is removed if
          you uninstall the module.
        </p>
      </section>
      <ul className="flex flex-col gap-2">
        {notes.length === 0 ? (
          <li className="text-sm" style={{ color: "var(--muted)" }}>No notes yet.</li>
        ) : (
          notes.map((n) => (
            <li key={n.id} className="card p-3 text-sm">
              {n.text}{" "}
              <span style={{ color: "var(--muted)" }}>· {new Date(n.createdAt).toLocaleString()}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
