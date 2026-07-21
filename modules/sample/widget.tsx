import Link from "next/link";
import type { ModuleWidgetProps } from "@/lib/modules/types";

/** Dashboard widget for the sample module: heading + note count + a link to its page. */
export default async function SampleWidget({ ctx }: ModuleWidgetProps) {
  const heading = String((await ctx.settings.get("heading")) ?? "Notes");
  let count = 0;
  if (ctx.db) {
    const rows = await ctx.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${ctx.db.table("notes")}`);
    count = Number(rows[0]?.n ?? 0);
  }
  return (
    <div className="card p-4">
      <p className="font-medium">{heading}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {count} note{count === 1 ? "" : "s"} ·{" "}
        <Link href="/m/sample" style={{ color: "var(--primary)" }}>
          open
        </Link>
      </p>
    </div>
  );
}
