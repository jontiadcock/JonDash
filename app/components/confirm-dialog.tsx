"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * In-page confirmation modal, replacing `window.confirm()` so prompts render inside the app.
 *
 * ⚠ Must stay portalled into `document.body` (BUG-23). `position: fixed` is viewport-relative only
 * while NO ancestor has `transform`, `filter`, `perspective`, `backdrop-filter`, `will-change` or
 * `contain`; any of those becomes the containing block and traps the modal inside it. Admin pages
 * are wrapped in `.page-fade`, which retains its final transform forever.
 *
 * REFS app/admin/ui.tsx — the only caller
 *      app/components/server-wait-overlay.tsx — portalled for the same reason
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

  // ⚠ Guard on `document`, not a mounted-state flag — `useEffect(() => setState(true))` is a
  // cascading render the React Compiler lint refuses. The server render is null regardless.
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
