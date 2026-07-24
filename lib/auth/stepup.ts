import "server-only";
import { getCurrentSession, markCurrentSessionTotpVerified } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/guards";
import { consumeTotpForUser } from "@/lib/auth/totp";

// A major destructive action needs proof of TOTP within this window. If the user
// verified TOTP more recently (login or a prior step-up), no re-entry is asked.
export const STEP_UP_WINDOW_MS = 1000 * 60 * 30; // 30 minutes

/** True if the current session verified TOTP within the step-up window. */
export async function hasRecentTotp(): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session?.totpVerifiedAt) return false;
  return Date.now() - session.totpVerifiedAt.getTime() < STEP_UP_WINDOW_MS;
}

export type StepUpResult = { ok: true } | { ok: false; error: string };

/**
 * Gate a major destructive action. The caller passes the phrase the user typed
 * (must equal `phrase`, e.g. "Everything") and — only when TOTP isn't fresh — a
 * current authenticator code. On success, refreshes the session's TOTP freshness.
 */
export async function verifyStepUp(opts: {
  typed: string;
  phrase: string;
  totpCode?: string;
}): Promise<StepUpResult> {
  if (opts.typed.trim() !== opts.phrase) {
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
