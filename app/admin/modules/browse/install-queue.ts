"use client";

import { useSyncExternalStore } from "react";

/**
 * Modules queued for one batched install.
 *
 * **Why a queue exists at all.** A module's code is compiled into the app, so every install costs
 * a rebuild and a restart — and a restart signs everyone out. Installing three modules one at a
 * time is three of those. The queue turns it into one.
 *
 * **Why it lives in `sessionStorage` rather than React state.** Queuing now happens on a module's
 * own detail page (design B1), so building a batch means visiting several pages: grid → module →
 * back → another module. Component state does not survive that, and the previous design — a
 * checkbox on each row of one long list — is exactly what had to go, because it let a module be
 * queued without its permissions ever being on screen.
 *
 * `sessionStorage`, not `localStorage`, deliberately: a half-built batch is a thought you are in
 * the middle of, not a preference. It should not still be waiting in a week, or in another tab.
 *
 * The custom event is what keeps two components in step — the button on a detail page and the bar
 * on the grid — without threading state through pages that do not otherwise share any.
 */
const KEY = "jondash.installQueue";
const CHANGED = "jondash:install-queue";

/*
 * The snapshot is CACHED, and it has to be.
 *
 * `useSyncExternalStore` compares snapshots by identity to decide whether to re-render. Parsing
 * the JSON on every call would hand it a brand-new array each time, which reads as "changed
 * again" forever — an infinite render loop rather than a subtle inefficiency. So the parsed value
 * is kept and only rebuilt when the underlying string actually differs.
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

export function toggleQueued(id: string): void {
  const ids = read();
  write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

export function clearQueue(): void {
  write([]);
}

/**
 * The live queue. Re-reads on any change, in this tab or another.
 *
 * `useSyncExternalStore` rather than state synced by an effect: session storage is exactly what
 * it is for — a mutable source outside React, with a separate answer for the server render, where
 * no such storage exists. Reading it in an effect instead means one render showing an empty queue
 * before the real one arrives, and React 19 rightly objects to setting state from an effect body.
 */
export function useInstallQueue(): string[] {
  return useSyncExternalStore(subscribe, read, () => NONE);
}
