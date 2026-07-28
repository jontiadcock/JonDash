/**
 * Holds the catalogue and the overlay slot side by side.
 *
 * The `modal` slot is what keeps the grid alive underneath: clicking a card matches
 * `@modal/(.)[id]` instead of replacing `children`, so the catalogue you were looking at — with
 * its channel, its page number and its scroll position — is still mounted behind the panel and is
 * exactly what you get back when the panel closes.
 *
 * `@modal/default.tsx` is what makes the other half work. A slot with no match on a full page load
 * renders its `default`, and 404s the whole route if there isn't one — so the "no module open"
 * state has to be spelled out, and it is simply nothing.
 *
 * No chrome of its own on purpose: this layout is plumbing, and anything drawn here would appear
 * on the catalogue and on every module page alike.
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
