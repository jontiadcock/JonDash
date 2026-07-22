"use client";

import { useState } from "react";
import { EditLinkFields, ConfirmSubmit } from "./ui";
import { deleteLinkAction, moveLinkAction } from "./actions";

type LinkRow = {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
  updatedAt: Date;
};

/** One service tile row: a horizontal summary (icon · name/url · controls) with
 *  the edit form expanding full-width beneath it (so it stacks cleanly on mobile). */
function Row({ link, index, count }: { link: LinkRow; index: number; count: number }) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex flex-col py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: "var(--surface-2)" }}
        >
          {link.iconPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/icons/${link.id}?v=${link.updatedAt.getTime()}`}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          ) : (
            <span className="text-lg font-bold" style={{ color: "var(--primary)" }}>
              {link.title.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{link.title}</p>
          <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
            {link.url}
          </p>
        </div>
        <div className="flex flex-none items-center gap-1">
          <form action={moveLinkAction}>
            <input type="hidden" name="id" value={link.id} />
            <input type="hidden" name="dir" value="up" />
            <button type="submit" className="btn btn-ghost !py-1 !px-2 text-xs" disabled={index === 0} aria-label="Move up">
              ↑
            </button>
          </form>
          <form action={moveLinkAction}>
            <input type="hidden" name="id" value={link.id} />
            <input type="hidden" name="dir" value="down" />
            <button
              type="submit"
              className="btn btn-ghost !py-1 !px-2 text-xs"
              disabled={index === count - 1}
              aria-label="Move down"
            >
              ↓
            </button>
          </form>
          <button
            type="button"
            className="btn btn-ghost !py-1 !px-2 text-xs"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            Edit
          </button>
          <form action={deleteLinkAction}>
            <input type="hidden" name="id" value={link.id} />
            <ConfirmSubmit className="btn btn-danger !py-1 !px-2 text-xs" message={`Delete “${link.title}”?`}>
              Delete
            </ConfirmSubmit>
          </form>
        </div>
      </div>
      {editing && (
        <EditLinkFields
          link={{ id: link.id, title: link.title, url: link.url }}
          onDone={() => setEditing(false)}
        />
      )}
    </li>
  );
}

/**
 * Reusable list of service tiles with move/edit/delete controls. Works for both
 * a user's personal tiles and a role's tiles, since all actions operate by link id.
 */
export function LinkList({ links }: { links: LinkRow[] }) {
  if (links.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No services yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
      {links.map((link, i) => (
        <Row key={link.id} link={link} index={i} count={links.length} />
      ))}
    </ul>
  );
}
