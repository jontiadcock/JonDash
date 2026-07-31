"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The save row every settings form uses — one button, one "(not saved yet)", one result. Shared
 * rather than left to a documented convention: an import cannot be re-broken by the next form
 * somebody writes, and before this some screens said "Saved.", some said nothing, and none said
 * that what was on screen was not yet what was stored.
 *
 * REFS app/admin/ — 11 forms pair it with `useFormDirty()` below: ui.tsx · email/ui.tsx ·
 *      network/ui.tsx · network/public-address.tsx · sessions/session-length-form.tsx ·
 *      settings/ui.tsx · settings/logo-form.tsx · settings/style-form.tsx ·
 *      updates/schedule-form.tsx · modules/[id]/ui.tsx · modules/[id]/groups-form.tsx
 * PINS tests/unit/settings-forms.test.ts
 */
export function SaveBar({
  dirty,
  pending,
  success,
  error,
  label = "Save changes",
  savingLabel = "Saving…",
  children,
}: {
  /** Has the user changed anything since the last save? Drives the notice and the button. */
  dirty: boolean;
  pending: boolean;
  /** Shown once a save lands, and only while nothing is edited. */
  success?: string | null;
  error?: string | null;
  label?: string;
  savingLabel?: string;
  /** Extra controls that belong on the same row (a secondary action, a link). */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Disabled while clean on purpose: the enabled state itself carries information — if the
          button is available, you have unsaved work. */}
      <button type="submit" className="btn btn-primary" disabled={pending || !dirty}>
        {pending ? savingLabel : label}
      </button>
      {children}
      {dirty && !pending && (
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          Not saved yet.
        </span>
      )}
      {/* Only when clean — a success message beside edited fields claims the screen matches
          what is stored, which is the exact confusion this component exists to fix. */}
      {!dirty && !pending && success && (
        <span className="text-sm" style={{ color: "var(--success)" }}>
          {success}
        </span>
      )}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

/**
 * Tracks whether a form has been edited since its last save, and stops React resetting the form
 * afterwards — the actual cause of "I click Save and it reverts".
 *
 * ⚠ React 19 calls `form.reset()` once the action resolves, restoring each control to its
 * server-rendered default while React's own state keeps the new value; the screen and the state
 * then disagree silently until a reload. `reset` is cancelable, so `preventDefault()` on it is the
 * whole fix — and a CONTROLLED field is the case that breaks, so converting to controlled is not.
 * ⚠ Write-only secret fields relied on that reset to clear; key them on `generation` instead.
 * REFS useServerValue() below — the other half of the same problem
 * PINS tests/unit/settings-forms.test.ts
 */
export function useFormDirty(result: unknown): {
  dirty: boolean;
  /** Spread onto the `<form>`: `<form {...dirtyProps}>`. */
  dirtyProps: {
    onInput: () => void;
    onChange: () => void;
    onReset: (e: React.FormEvent) => void;
  };
  /** Bumped on every completed save. Key write-only fields on it so they clear. */
  generation: number;
  setDirty: (v: boolean) => void;
} {
  const [dirty, setDirty] = useState(false);
  const [generation, setGeneration] = useState(0);
  const seen = useRef(result);

  /*
   * A new `result` identity means a save completed — identity, not a success flag, because two
   * saves in a row both produce `{ok: true}`.
   * ⚠ Must be an effect. As a render-phase update it discarded the in-progress render, and a
   * `setDirty(true)` from the change handler that had not committed yet was lost in the replay.
   */
  useEffect(() => {
    if (seen.current !== result) {
      seen.current = result;
      setDirty(false);
      setGeneration((g) => g + 1);
    }
  }, [result]);
  return {
    dirty,
    generation,
    dirtyProps: {
      // Both, because they do not overlap: `input` covers typing but not every select in every
      // browser, `change` covers checkboxes and file pickers but only fires on blur for text.
      onInput: () => setDirty(true),
      onChange: () => setDirty(true),
      onReset: (e) => e.preventDefault(),
    },
    setDirty,
  };
}

/**
 * Props for a controlled `<select>`. ⚠ Always spread this — never write `onChange` alone.
 *
 * The browser fires `input` before `change`. React processes `input`, sees the DOM value no longer
 * match its `value` prop with no state update yet, and RESTORES the old value; by the time `change`
 * arrives there is nothing left to report, so `onChange` never runs and the selection snaps back.
 * Handling `input` too lands the state update before the restore, so there is nothing to undo.
 *
 * REFS app/admin/ — every `<select>` in the admin area: ui.tsx · email/ui.tsx · network/ui.tsx ·
 *      sessions/session-length-form.tsx · updates/schedule-form.tsx
 * PINS tests/unit/settings-forms.test.ts
 */
export function selectSync(set: (value: string) => void): {
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onInput: (e: React.FormEvent<HTMLSelectElement>) => void;
} {
  return {
    onChange: (e) => set(e.target.value),
    onInput: (e) => set((e.target as HTMLSelectElement).value),
  };
}

/**
 * Keeps a control showing the value the server actually holds.
 *
 * ⚠ `useState(serverValue)` takes it once, at mount. When a save revalidates and the server sends
 * something different — normalised, clamped, or not saved at all — the control keeps displaying the
 * old value and the screen quietly disagrees with the database. Whatever the server says must win.
 * Re-seeding only when that value genuinely CHANGES is what stops it stomping an edit in progress.
 * REFS app/admin/ — 10 forms: ui.tsx · email/ui.tsx · network/ui.tsx · network/public-address.tsx ·
 *      sessions/session-length-form.tsx · settings/ui.tsx · settings/style-form.tsx ·
 *      updates/schedule-form.tsx · modules/[id]/ui.tsx · modules/[id]/groups-form.tsx
 * PINS tests/unit/settings-forms.test.ts
 */
export function useServerValue<T>(current: T): [T, (v: T) => void] {
  const [value, setValue] = useState(current);
  const seeded = useRef(current);

  /*
   * ⚠ The re-seed must live in an EFFECT, not the render body. As a render-phase update
   * (`if (seeded !== current) setValue(current)`) it races the user's own input: React throws the
   * in-progress render away and replays it, and a `setValue` from the change handler that has not
   * committed yet loses to the re-seed. The symptom was a `<select>` ignoring its first change
   * after page load. An effect runs after commit, so it can only react to real server news.
   */
  useEffect(() => {
    if (!Object.is(seeded.current, current)) {
      seeded.current = current;
      setValue(current);
    }
  }, [current]);

  return [value, setValue];
}
