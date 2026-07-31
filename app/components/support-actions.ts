"use server";

import { requireUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { setUserFlag, USER_FLAG } from "@/lib/user-prefs";

/**
 * Remember that this person dismissed the support banner (CORE-05, BUG-74).
 *
 * ⚠ No arguments, on purpose: it sets one flag for the signed-in user and nothing else, so there
 * is no id to tamper with and no other flag it can be pointed at.
 * Its own file because the component is `"use client"`, which cannot import a `"use server"`
 * module.
 *
 * REFS app/components/support.tsx › SupportBanner() — the only caller
 *      lib/user-prefs.ts › USER_FLAG.supportBannerDismissed
 * PINS tests/unit/support-page.test.ts
 */
export async function dismissSupportBannerAction(): Promise<void> {
  await assertSameOrigin();
  const user = await requireUser();
  await setUserFlag(user.id, USER_FLAG.supportBannerDismissed, true);
}

/*
 * ⚠ DO NOT add the matching read here. Every export from a `"use server"` module is a callable
 * endpoint, so a `hasDismissed(userId)` helper would be a route anyone could call with anyone's id.
 * REFS lib/user-prefs.ts › getUserFlag() — server-only, and what the layouts call instead
 */
