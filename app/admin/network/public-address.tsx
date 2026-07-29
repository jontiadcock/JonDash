"use client";

import { useActionState } from "react";
import { SaveBar, useFormDirty, useServerValue } from "@/app/components/save-bar";
import { savePublicAddressAction, type NetworkState } from "./actions";

const initial: NetworkState = {};

/**
 * The address people reach this install by, from outside.
 *
 * **Moved here from General in 1.8.3** (owner request). It answers the same question as the rest of
 * this page — how is this JonDash reached — and it has to agree with the ports and certificate
 * configured above it, which is far easier when they are on one screen.
 *
 * **Its own form, deliberately.** The settings above write `.data/network.json`; this writes the
 * settings table. One form spanning two stores could half-succeed, and "saved" would then be a lie
 * about one of them.
 *
 * ## Related code
 * - `lib/settings.ts` — `app.publicUrl` and the `network` group this renders.
 * - `lib/app-url.ts` — reads it, and explains why a blank value omits links rather than guessing.
 * - `app/admin/network/actions.ts` — `savePublicAddressAction`.
 * - `lib/email/template.ts` — the CTA that disappears when this is blank.
 */
export function PublicAddressForm({ value }: { value: string }) {
  const [state, action, pending] = useActionState(savePublicAddressAction, initial);
  const { dirty, dirtyProps } = useFormDirty(state);
  const [url, setUrl] = useServerValue(value);

  return (
    <form action={action} {...dirtyProps} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="publicUrl">
          Public address
        </label>
        <input
          id="publicUrl"
          name="app.publicUrl"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://dash.example.com"
          className="input"
        />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Where people reach this JonDash from outside — used for links in email. Leave it blank and
          emails simply won&apos;t include buttons, which is safer than guessing an address that
          might be wrong.
        </p>
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        success={state.ok ? "Saved." : null}
        error={state.error}
        label="Save public address"
      />
    </form>
  );
}
