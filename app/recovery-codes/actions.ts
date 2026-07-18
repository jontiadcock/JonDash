"use server";

import { redirect } from "next/navigation";
import { assertSameOrigin } from "@/lib/security/csrf";
import { peekRevealCodes, clearRevealCodes } from "@/lib/auth/recovery-reveal";

/** Dismiss the one-time recovery-codes view and continue to the next page. */
export async function continueFromRevealAction(): Promise<void> {
  await assertSameOrigin();
  const reveal = await peekRevealCodes();
  const next = reveal?.next ?? "/login";
  await clearRevealCodes();
  redirect(next);
}
