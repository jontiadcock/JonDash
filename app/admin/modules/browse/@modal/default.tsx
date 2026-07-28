/**
 * Nothing, when no module is open.
 *
 * A parallel route slot needs a `default` for every state it is *not* in — without one, a hard
 * reload of the catalogue tries to render a slot that has no match and 404s the whole page. So
 * the "no overlay" state has to be spelled out, and it is simply nothing.
 */
export default function NoModal() {
  return null;
}
