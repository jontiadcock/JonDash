import { EditLinkForm, ConfirmSubmit } from "./ui";
import { deleteLinkAction, moveLinkAction } from "./actions";

type LinkRow = {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
  updatedAt: Date;
};

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
        <li key={link.id} className="flex flex-col py-4 first:pt-0 last:pb-0">
          <div className="flex items-center gap-4">
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
            <div className="flex items-center gap-1">
              <form action={moveLinkAction}>
                <input type="hidden" name="id" value={link.id} />
                <input type="hidden" name="dir" value="up" />
                <button type="submit" className="btn btn-ghost !py-1 !px-2 text-xs" disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
              </form>
              <form action={moveLinkAction}>
                <input type="hidden" name="id" value={link.id} />
                <input type="hidden" name="dir" value="down" />
                <button
                  type="submit"
                  className="btn btn-ghost !py-1 !px-2 text-xs"
                  disabled={i === links.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </form>
              <EditLinkForm link={{ id: link.id, title: link.title, url: link.url }} />
              <form action={deleteLinkAction}>
                <input type="hidden" name="id" value={link.id} />
                <ConfirmSubmit className="btn btn-danger !py-1 !px-2 text-xs" message={`Delete “${link.title}”?`}>
                  Delete
                </ConfirmSubmit>
              </form>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
