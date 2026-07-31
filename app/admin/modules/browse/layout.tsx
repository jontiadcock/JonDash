/**
 * Holds the catalogue and the overlay slot side by side.
 *
 * The `modal` slot is what keeps the grid alive underneath: clicking a card matches the
 * intercepting route instead of replacing `children`, so the catalogue — its channel, page number
 * and scroll position — is still mounted behind the panel and is what you get back on close.
 *
 * ⚠ Both halves are required. A slot with no match on a full page load renders its `default`, and
 * 404s the whole route if there is not one.
 * ⚠ No chrome of its own: anything drawn here appears on the catalogue AND every module page.
 * REFS ./@modal/(.)[id]/page.tsx — the intercepting route · ./@modal/default.tsx — the empty state
 *      ./page.tsx — the catalogue this keeps mounted
 */
export default function BrowseLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
