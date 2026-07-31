/**
 * Nothing, when no module is open.
 *
 * ⚠ DO NOT delete this because it renders nothing. A parallel-route slot needs a `default` for
 * every state it is not in: without one, a hard reload of the catalogue tries to render a slot with
 * no match and 404s the whole page.
 * REFS ../layout.tsx — declares the slot · ./(.)[id]/page.tsx — the state this is the absence of
 */
export default function NoModal() {
  return null;
}
