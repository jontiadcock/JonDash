import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import type { ModuleChannel } from "@/lib/modules/sources";
import { ModuleDetail, loadModule } from "../module-detail";

export const dynamic = "force-dynamic";

/**
 * One module's page — a single reading column, opened from a card in the catalogue.
 *
 * ⚠ This is where CONSENT happens, and it is why the page exists: the full list of what a module
 * can do, and the install actions, are on the same screen. Neither queueing nor installing may be
 * reachable without passing through it — a per-row checkbox once let a module be installed with
 * its permissions never on screen.
 * ⚠ `channel` and `page` ride in the query string, not component state, so Back returns to the
 * catalogue page you left rather than page 1.
 *
 * REFS ../module-detail.tsx › ModuleDetail — the shared screen; the overlay renders the same one,
 *      so a permission listed in only one of them cannot happen
 *      ../module-overlay.tsx — the in-grid expansion this page is the deep-link equivalent of
 */
export default async function ModuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; page?: string }>;
}) {
  await requirePermission("modules.manage");
  const { id } = await params;
  const { channel: rawChannel, page } = await searchParams;
  const channel: ModuleChannel = rawChannel === "beta" ? "beta" : "stable";

  const m = await loadModule(id, channel);
  // A module that is not in this channel's manifest genuinely is not here — an id in the URL is
  // not evidence it exists, and inventing a page for one would be worse than saying so.
  if (!m) notFound();

  const backHref = `/admin/modules/browse?channel=${channel}${page ? `&page=${encodeURIComponent(page)}` : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={backHref} className="text-sm" style={{ color: "var(--muted)" }}>
        ← Browse modules
      </Link>

      <ModuleDetail m={m} channel={channel} />
    </div>
  );
}
