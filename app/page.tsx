import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { hasActiveAdmin } from "@/lib/auth/bootstrap";

/** REFS lib/auth/guards.ts · lib/auth/bootstrap.ts */

// Auth state must be evaluated per request, never statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await hasActiveAdmin())) redirect("/welcome");
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
