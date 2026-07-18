"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { destroySession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

export async function logoutAction() {
  await assertSameOrigin();
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit("logout", { userId: user.id });
  redirect("/login");
}
