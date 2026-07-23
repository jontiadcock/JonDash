"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * In-page confirmation modal — replaces the native window.confirm() popup so
 * prompts render inside the app (and don't block automation / look like OS dialogs).
 *
 * **Portalled into `document.body` (BUG-23).** `position: fixed` is only relative to the
 * viewport while NO ancestor has a `transform`, `filter`, `perspective`, `backdrop-filter`,
 * `will-change` or `contain` — any of those makes that ancestor the containing block, and
 * the modal is quietly trapped inside it instead of covering the page. Admin pages are
 * wrapped in `.page-fade`, whose keyframes animate `transform` with
 * `animation-fill-mode: both`, so the final transform is retained forever and every dialog
 * rendered from a page was confined to the content column. A portal escapes ancestor
 * transforms, `overflow: hidden` and stacking contexts permanently, rather than depending
 * on layout CSS staying benign — which it didn't.
 */
export function ConfirmDialog({
  open,
  title = "Please confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // Only ever open after a client action, so the server render is always null anyway;
  // guarded on `document` rather than a mounted-state flag, which the React Compiler lint
  // correctly refuses as a cascading render.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, #000 55%, transparent)" }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm p-6"
        style={{ background: "var(--background)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
