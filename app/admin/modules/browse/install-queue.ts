"use client";

import { useSyncExternalStore } from "react";

/*
 * Modules queued for one batched install. Every install costs a rebuild and a restart that signs
 * everyone out, so three modules one at a time is three of those; the queue makes it one.
 *
 * ⚠ **`sessionStorage`, not React state**: queuing happens on each module's detail page, so
 *   building a batch means grid → module → back → another module, which component state does not
 *   survive. The old design — a checkbox per row of one list — had to go because it let a module be
 *   queued without its permissions ever being on screen.
 * ⚠ **Session, not local**: a half-built batch is a thought in progress, not a preference. It
 *   should not still be waiting in a week or in another tab.
 *
 * REFS app/admin/modules/browse/[id]/module-actions.tsx — the queue button on a detail page
 *      app/admin/modules/browse/queued-install-bar.tsx — the bar the custom event keeps in step
 * PINS tests/unit/browse-consent.test.ts
 */
const KEY = "jondash.installQueue";
const CHANGED = "jondash:install-queue";

/*
 * ⚠ The snapshot MUST be cached. `useSyncExternalStore` compares by identity, so parsing the JSON
 *   on every call hands it a new array each time — an infinite render loop, not a small waste.
 */
let cachedRaw: string | null | undefined;
let cached: string[] = [];

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    raw = null; // storage disabled — an empty queue is always safe
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const v: unknown = raw ? JSON.parse(raw) : [];
      cached = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      cached = []; // holding nonsense
    }
  }
  return cached;
}

/** A stable empty array for the server render, which has no session storage. */
const NONE: string[] = [];

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* private mode, quota — the batch is a convenience, never a correctness requirement */
  }
  // `storage` only fires in OTHER tabs, so same-tab listeners need this one.
  window.dispatchEvent(new CustomEvent(CHANGED));
}

/** REFS module-actions.tsx — the button · queued-install-bar.tsx — the remove control. */
export function toggleQueued(id: string): void {
  const ids = read();
  write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

/** REFS queued-install-bar.tsx — cleared once the batch is submitted. */
export function clearQueue(): void {
  write([]);
}

/**
 * The live queue, re-reading on any change in this tab or another.
 *
 * ⚠ `useSyncExternalStore`, never state synced by an effect — an effect means one render showing an
 *   empty queue before the real one arrives, and React 19 objects to setting state from an effect
 * body. REFS module-actions.tsx · queued-install-bar.tsx — the two components it keeps in step
 */
export function useInstallQueue(): string[] {
  return useSyncExternalStore(subscribe, read, () => NONE);
}
