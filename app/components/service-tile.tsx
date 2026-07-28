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
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="card group flex flex-col items-center gap-3 p-5 text-center"
      title={title}
    >
      <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
        {iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconSrc} alt="" width={48} height={48} className="h-12 w-12 object-contain" />
        ) : (
          <span className="text-2xl font-bold" style={{ color: "var(--primary)" }}>
            {initial}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-sm font-medium">{title}</span>
    </a>
  );
}
