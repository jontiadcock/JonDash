"use server";

import { requireUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { setUserFlag, USER_FLAG } from "@/lib/user-prefs";

/**
 * Remember that this person dismissed the support banner (CORE-05, BUG-74).
 *
 * Its own file rather than living beside the component, because that component is `"use client"`
 * and a `"use server"` module cannot be imported from one that starts with `"use client"`.
 *
 * No arguments on purpose. It sets one flag for the signed-in user and can do nothing else, so
 * there is no id to tamper with and no other flag it could be pointed at.
 */
export async function dismissSupportBannerAction(): Promise<void> {
  await assertSameOrigin();
  const user = await requireUser();
  await setUserFlag(user.id, USER_FLAG.supportBannerDismissed, true);
}

/*
 * **The matching READ is deliberately not here.** Every export from a `"use server"` module becomes
 * a callable endpoint, so a `hasDismissed(userId)` helper would be a route anyone could call with
 * anyone's id. Layouts read it directly through `getUserFlag`, which is server-only and takes the
 * id they already resolved from the session.
 */
