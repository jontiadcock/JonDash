"use client";

import { useState } from "react";

/**
 * The save row every settings form uses — one button, one "(not saved yet)", one result.
 *
 * Owner, 2026-07-27: *"a lot of buttons are doing the same thing"* and *"a note to user saying
 * (not saved yet) on all savable settings is important for consistency"*. Before this, each
 * screen had grown its own: some said "Saved.", some said nothing, some disabled the button
 * while clean and some didn't, and none of them told you that what was on screen wasn't yet
 * what was stored. Sharing one component is the only way that stays true as screens are added.
 *
 * **Why a shared component rather than a convention.** A convention documented in a comment is
 * re-broken by the next form somebody writes. This one is imported, so a new screen gets the
 * behaviour by default and cannot drift by accident.
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
      {/*
        Disabled while clean, on purpose. A save button that is live when there is nothing to
        save invites the click that teaches you it does nothing — and here it also means the
        enabled state itself carries information: if it is available, you have unsaved work.
      */}
      <button type="submit" className="btn btn-primary" disabled={pending || !dirty}>
        {pending ? savingLabel : label}
      </button>
      {children}
      {dirty && !pending && (
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          Not saved yet.
        </span>
      )}
      {/* Only when clean: a success message next to edited fields would be claiming that what
          you are looking at is what's stored, which is exactly the confusion being fixed. */}
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
 * Tracks whether a form has been edited since it was last saved, and **stops React resetting the
 * form after a save** — which is the actual cause of "I click Save and it reverts".
 *
 * **The revert, and why two earlier fixes missed it.** React 19 calls `form.reset()` once the
 * action resolves. A reset restores each control to its *server-rendered* default, so the select
 * you just changed snaps back to the value the page loaded with. React's own state still holds
 * the new value, so from React's point of view nothing changed and it never rewrites the DOM —
 * the screen and the state disagree, silently, until the page is reloaded. Measured live on
 * 1.8.0-beta.11: after saving, React's prop read `1440` while the DOM read `480`.
 *
 * That makes a **controlled** field the case that breaks, which is why converting these forms
 * from `defaultValue` to controlled (beta.8) changed nothing, and why removing the settings
 * cache (beta.11) — a real bug, but a different one — did not fix it either. The save always
 * worked; only the display lied.
 *
 * `reset` is a cancelable event, so `preventDefault()` on it is the whole fix. Write-only secret
 * fields relied on that reset to clear themselves, so they are keyed on `generation` instead.
 *
 * **Dirtiness listens to the form, not to each field.** `input` and `change` bubble, so one
 * handler catches everything — typed text, a toggled checkbox, a chosen file — including any
 * field added later without anyone remembering to wire it up.
 *
 * `result` is the object from `useActionState`. A new identity means a save completed; this
 * deliberately keys on identity rather than a success flag, because two saves in a row both
 * produce `{ok: true}` and only the identity distinguishes them.
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
  const [seen, setSeen] = useState(result);
  if (seen !== result) {
    setSeen(result);
    setDirty(false);
    setGeneration((g) => g + 1);
  }
  return {
    dirty,
    generation,
    dirtyProps: {
      // Both, because they do not overlap: `input` covers typing but not every select in every
      // browser, and `change` covers checkboxes and file pickers but only fires on blur for text.
      onInput: () => setDirty(true),
      onChange: () => setDirty(true),
      onReset: (e) => e.preventDefault(),
    },
    setDirty,
  };
}

/**
 * Keeps a control showing the value the server actually holds.
 *
 * A control seeded with `useState(serverValue)` takes that value **once**, at mount. When a save
 * revalidates and the server sends a different value — because it normalised it, clamped it, or
 * because the save didn't take — the control carries on displaying the old one, and the screen
 * quietly disagrees with the database until someone reloads. That is the bug behind the owner's
 * *"when clicking save, the button reverts"*: whatever the server ends up saying has to win.
 *
 * Re-seeding only when the server value genuinely CHANGES is what makes this safe — an edit in
 * progress is not stomped by every unrelated re-render, only by real news from the server.
 */
export function useServerValue<T>(current: T): [T, (v: T) => void] {
  const [value, setValue] = useState(current);
  const [seeded, setSeeded] = useState(current);
  if (!Object.is(seeded, current)) {
    setSeeded(current);
    setValue(current);
  }
  return [value, setValue];
}
