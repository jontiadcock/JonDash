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
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="card group flex flex-col items-center gap-3 p-5 text-center transition hover:-translate-y-0.5 hover:shadow-lg"
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
