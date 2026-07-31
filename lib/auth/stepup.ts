import "server-only";
import { getCurrentSession, markCurrentSessionTotpVerified } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/guards";
import { consumeTotpForUser } from "@/lib/auth/totp";

/*
 * A major destructive action needs proof of TOTP within this window; a more recent verification —
 * login, or a prior step-up — counts, so it is not asked for twice in quick succession.
 * ⚠ Widening it widens how long a walked-away-from session can restore a backup.
 * PINS tests/unit/stepup.test.ts
 */
export const STEP_UP_WINDOW_MS = 1000 * 60 * 30; // 30 minutes

/** True if the current session verified TOTP within the step-up window. */
/** REFS app/admin/backup/page.tsx */
export async function hasRecentTotp(): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session?.totpVerifiedAt) return false;
  return Date.now() - session.totpVerifiedAt.getTime() < STEP_UP_WINDOW_MS;
}

export type StepUpResult = { ok: true } | { ok: false; error: string };

/**
 * Gate a major destructive action with a current authenticator code — and, where the caller asks
 * for one, a typed confirmation phrase.
 *
 * **`phrase` is optional as of 1.8.0.** Restore dropped its "type Everything" box at the owner's
 * request in favour of a plain warning about what is about to be overwritten. The typed phrase was
 * never the security control here — anyone able to type it is already signed in as an admin — it
 * was a speed bump, and one that reliably taught people to type the word without reading the
 * sentence above it. **The authenticator step-up below is the real gate and is unchanged**: omit
 * the phrase and you still cannot restore without proving TOTP within the window.
 * REFS app/admin/backup/actions.ts
 */
export async function verifyStepUp(opts: {
  typed?: string;
  phrase?: string;
  totpCode?: string;
}): Promise<StepUpResult> {
  if (opts.phrase && (opts.typed ?? "").trim() !== opts.phrase) {
    return { ok: false, error: `Type "${opts.phrase}" exactly to confirm.` };
  }

  if (await hasRecentTotp()) return { ok: true };

  const user = await getCurrentUser();
  if (!user?.totpSecretEnc) {
    return { ok: false, error: "Two-factor authentication is required for this action." };
  }

  const code = (opts.totpCode ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  }
  if (!(await consumeTotpForUser(user, code))) {
    return { ok: false, error: "That authenticator code is incorrect." };
  }

  await markCurrentSessionTotpVerified();
  return { ok: true };
}
