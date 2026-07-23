"use client";

import { useActionState } from "react";
import { pinHelperChannelAction, type HelperUpdateState } from "../updates/helper-actions";

/**
 * Channel control for one helper (MOD-10).
 *
 * The Helpers page is otherwise read-only by design — a helper isn't something you install
 * or remove, and giving it install controls would undermine the rule that helpers arrive
 * only as a module's dependency. A channel pin is the one deliberate exception: without it
 * the only way to take a helper fix early, or step back off beta, is to move every module
 * that depends on it.
 *
 * The normal state is "automatic" — the channel follows the modules that need it. A pin is
 * shown as an override precisely so it doesn't quietly become the new normal.
 */
export function HelperChannelForm({
  helperId,
  channel,
  pinned,
  derived,
  betaDependents,
}: {
  helperId: string;
  channel: string;
  pinned: boolean;
  derived: string;
  betaDependents: string[];
}) {
  const [state, action, pending] = useActionState<HelperUpdateState, FormData>(pinHelperChannelAction, {});

  return (
    <div className="mt-2">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        On the <strong>{channel}</strong> channel
        {pinned ? (
          <> — pinned by you (it would otherwise follow its modules and be on {derived}).</>
        ) : betaDependents.length > 0 ? (
          <> — automatically, because {betaDependents.join(", ")} {betaDependents.length === 1 ? "is" : "are"} on beta.</>
        ) : (
          <> — automatically, following the modules that use it.</>
        )}
      </p>

      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="helperId" value={helperId} />
        {pinned ? (
          <button
            type="submit"
            name="channel"
            value="auto"
            className="btn btn-ghost !py-1 !px-2 text-xs"
            disabled={pending}
          >
            Follow its modules again
          </button>
        ) : (
          <button
            type="submit"
            name="channel"
            value={channel === "beta" ? "stable" : "beta"}
            className="btn btn-ghost !py-1 !px-2 text-xs"
            disabled={pending}
          >
            Pin to {channel === "beta" ? "stable" : "beta"}
          </button>
        )}
        {state.error && (
          <span className="text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>
        )}
      </form>
    </div>
  );
}
