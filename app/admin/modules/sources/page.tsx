import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { ensureDefaultSource, listSources } from "@/lib/modules/sources";
import { SourcesManager, type SourceItem } from "./ui";

export const dynamic = "force-dynamic";

export default async function ModuleSourcesPage() {
  await requirePermission("modules.manage");
  // Seed the official source on first visit (only when no sources exist, so a
  // deliberate removal isn't undone).
  await ensureDefaultSource();

  const items: SourceItem[] = (await listSources()).map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    enabled: s.enabled,
    isDefault: s.isDefault,
  }));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link href="/admin/modules" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Modules
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Module sources</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          A source is a public GitHub repository that publishes modules. JonDash reads its list of modules
          from the repository&apos;s <code>addons.json</code> — the <strong>main</strong> branch for stable
          releases and the <strong>beta</strong> branch for beta ones. Only add sources you trust: a module
          runs inside JonDash, and you approve its permissions when you install it.
        </p>
      </section>

      <section className="card p-6">
        <SourcesManager items={items} />
      </section>
    </div>
  );
}
