/**
 * A single service tile: icon on top, name underneath. Purely presentational
 * and view-only. Title/URL are rendered as text/attributes so React escapes
 * them; links open in a new tab with rel="noopener noreferrer".
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
   * **No `lift` here — the dashboard frame owns the hover lift.**
   *
   * It used to carry its own, and once the frame started lifting too (1.8.0-beta.11, so module
   * widgets would rise like tiles) a service tile lifted *twice*: once with the frame and again
   * inside it. The inner lift moved the tile up within a container that clips
   * (`overflow-hidden`, which is what stops an oversized widget spilling), so the top of the
   * card was sliced off on hover — visible on tiles and not on modules, because only tiles had
   * the second lift. Owner-reported with a screenshot, 2026-07-28.
   *
   * Whether a tile rises at all, and how far, still belongs to the style (XP windows don't
   * float) — CORE-07. That decision now lives in one place instead of two.
   */
  /*
   * **The tile adapts to whatever size it has been given.**
   *
   * The frame clips what overflows, deliberately — a module widget that doesn't fit should look
   * obviously wrong rather than quietly scroll. But a service tile is CORE's content, not a
   * module's, so "the author must handle it" points back at us: at a small size the fixed 64px
   * icon plus 20px padding plus a label needed more height than the cell had, and the bottom of
   * the card was sliced off. Owner-reported with a screenshot, 2026-07-28.
   *
   * Sized against the FRAME (`@container`, set by dashboard-frame.tsx), not the viewport — a
   * viewport breakpoint says nothing about how big this particular tile is, and the whole point
   * of the grid is that one tile can be a sixth the size of its neighbour. So: below ~6rem there
   * is only room for the icon and the label is dropped; above ~8rem it returns to full size. The
   * icon is a proportion of the tile with a ceiling, so it shrinks rather than being cropped.
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
