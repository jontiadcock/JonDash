"use client";

import { useActionState } from "react";
import { uploadLogoAction } from "./actions";
import type { SettingsFormState } from "@/lib/settings";

/**
 * Logo upload for the Branding section (CORE-06). A file input rather than a text field, so
 * it sits outside the generic settings form — hence `branding.logo` being marked hidden in
 * the registry.
 */
export function LogoForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(uploadLogoAction, {});
  const error = state.errors?.["branding.logo"];

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/branding/logo?v=${current.slice(0, 8)}`}
            alt="Current logo"
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg object-contain"
            style={{ background: "var(--surface-2)" }}
          />
        ) : (
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg text-xs"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          >
            none
          </span>
        )}
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="text-sm"
          aria-label="Choose a logo image"
        />
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        PNG, JPEG, WebP or GIF, up to 2 MB. It&apos;s resized and re-saved as a PNG, and also used as the
        browser-tab icon. Without one, the square mark shows your app name&apos;s first letter.
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
          {pending ? "Uploading…" : "Upload logo"}
        </button>
        {current && (
          <button type="submit" name="remove" value="1" className="btn btn-ghost text-sm" disabled={pending}>
            Remove
          </button>
        )}
        {error && <span className="form-error">{error}</span>}
        {state.success && <span className="text-sm" style={{ color: "var(--muted)" }}>{state.success}</span>}
      </div>
    </form>
  );
}
