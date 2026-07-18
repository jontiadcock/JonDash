import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { hasActiveAdmin } from "@/lib/auth/bootstrap";

export default async function Home() {
  if (!(await hasActiveAdmin())) redirect("/welcome");
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
