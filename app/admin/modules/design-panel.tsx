import Link from "next/link";

/**
 * "Design your own module" — where somebody who wants to write one starts (7.1).
 *
 * **Two links, in the order they are actually useful.** The authoring guide explains the contract;
 * the template module is a working module you can copy, which is the fastest practical start and
 * the thing most people should reach for first. Anything more here would be a third copy of a
 * document that already exists and would drift from it.
 *
 * `docs/MODULES-AUTHORING.md` is **core's** document, not the add-ons repo's — a distinction worth
 * keeping straight, because the contract it describes is core's to define and change.
 *
 * The guide link follows the install's update channel: someone on beta is writing against beta's
 * contract, and stable's guide would describe an API their build does not have.
 */
export function DesignPanel({ guideUrl }: { guideUrl: string }) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div>
        <h2 className="font-medium">Design your own module</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          A module adds a dashboard widget, its own page, its own settings and its own data —
          without changing the base app. JonDash never imports a module directly, so with none
          installed it is byte-for-byte its normal self.
        </p>
      </div>

      <ul className="flex flex-col gap-3 text-sm">
        <li>
          <a href={guideUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
            Module authoring guide
          </a>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {" "}— the contract: what a module may declare, what it is given, and what is refused.
            It doubles as a prompt if you would rather have an AI write it. Opens the version
            matching your update channel.
          </span>
        </li>
        <li>
          <Link href="/admin/modules/browse" style={{ color: "var(--primary)" }}>
            Start from the <code>template</code> module
          </Link>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {" "}— a working module that does nothing interesting on purpose. Install it, copy the
            folder, rename it. Faster than starting from the guide, and it is already the right
            shape.
          </span>
        </li>
      </ul>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        When it is ready, bring it back through <strong>Import your own</strong> — a module you
        wrote is checked exactly like one from a source.
      </p>
    </div>
  );
}
