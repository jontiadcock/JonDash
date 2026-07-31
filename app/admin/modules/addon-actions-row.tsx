"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

/**
 * The row of things you can do on the Add-ons page — Browse, Import, Design, Sources (7.1).
 *
 * **Import used to be a permanently-open card at the foot of the page.** It is the rarest action
 * here (most people install from a source), and as a full-width panel it claimed more of the page
 * than Browse, which is what almost everyone actually wants. It is now one option in this row that
 * opens when asked for.
 *
 * **What must NOT be lost in the shrink**, and the reason this reveals a panel rather than linking
 * away: that panel carries the only statement anywhere in the product that an imported module is
 * checked — that anything reaching for an undeclared permission, touching the filesystem, or
 * running constructed code is refused. Someone about to sideload code into their own dashboard is
 * exactly who needs to read it, so it reappears in full the moment Import is chosen.
 * REFS app/admin/modules/page.tsx
 */
export function AddonActionsRow({
  importPanel,
  designPanel,
}: {
  /** The import form, rendered on the server and passed through — see the note below. */
  importPanel: ReactNode;
  designPanel: ReactNode;
}) {
  const [open, setOpen] = useState<"import" | "design" | null>(null);

  const tab = (id: "import" | "design", label: string) => (
    <button
      type="button"
      onClick={() => setOpen((v) => (v === id ? null : id))}
      className={open === id ? "btn btn-primary !py-1.5 text-sm" : "btn btn-ghost !py-1.5 text-sm"}
      aria-expanded={open === id}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Browse stays a link and stays first: it is what most people came here to do. */}
        <Link href="/admin/modules/browse" className="btn btn-ghost !py-1.5 text-sm">
          Browse modules
        </Link>
        {tab("import", "Import your own")}
        {tab("design", "Design your own module")}
        <Link href="/admin/modules/sources" className="btn btn-ghost !py-1.5 text-sm">
          Manage sources
        </Link>
      </div>

      {open === "import" && importPanel}
      {open === "design" && designPanel}
    </div>
  );
}
