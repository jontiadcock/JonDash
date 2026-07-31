/**
 * A single service tile: icon on top, name underneath. Purely presentational. Title and URL are
 * rendered as text and attributes so React escapes them; the link opens in a new tab with
 * `rel="noopener noreferrer"`.
 *
 * REFS app/(app)/dashboard/page.tsx — the only caller; supplies the icon URL
 *      app/(app)/dashboard/dashboard-frame.tsx — wraps this, and owns the hover lift
 * PINS tests/unit/dashboard-paint.test.ts
 */
export function ServiceTile({
  title,
  url,
  iconSrc,
}: {
  title: string;
  url: string;
  iconSrc: string | null;
}) {
  const initial = title.trim().charAt(0).toUpperCase() || "?";
  /*
   * ⚠ DO NOT add `lift` here — the dashboard frame owns the hover lift for both kinds. A tile that
   * lifts here too lifts twice, and the inner one moves it inside a container that clips, slicing
   * the top off the card. Whether a tile rises at all belongs to the style (CORE-07).
   *
   * ⚠ The tile must adapt to whatever size it is given. The frame clips overflow deliberately, but
   * a service tile is CORE's content — at a small size a fixed 64px icon plus padding plus a label
   * needed more height than the cell had and the bottom was sliced off. Sized against the FRAME
   * (`@container`, set by dashboard-frame.tsx), never the viewport: a breakpoint says nothing about
   * how big THIS tile is. Below ~6rem the label is dropped; the icon is a proportion with a ceiling
   * so it shrinks rather than being cropped.
   */
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="card group flex flex-col items-center justify-center gap-1 p-2 text-center @[8rem]:gap-3 @[8rem]:p-5"
      title={title}
    >
      <span
        className="flex aspect-square w-[46%] min-w-7 max-w-16 flex-none items-center justify-center overflow-hidden rounded-2xl"
        style={{ background: "var(--surface-2)" }}
      >
        {iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconSrc} alt="" width={48} height={48} className="h-3/4 w-3/4 object-contain" />
        ) : (
          <span className="text-sm font-bold @[8rem]:text-2xl" style={{ color: "var(--primary)" }}>
            {initial}
          </span>
        )}
      </span>
      {/* Hidden on a tile too small to show it — the icon and the tooltip still identify it, and
          a clipped half-line of text identifies nothing. */}
      <span className="hidden min-w-0 truncate text-xs font-medium @[6rem]:block @[8rem]:text-sm">
        {title}
      </span>
    </a>
  );
}
