import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getPreAuthUserId } from "@/lib/auth/preauth";
import { hasActiveAdmin } from "@/lib/auth/bootstrap";
import { PasswordForm, SecondFactorForm } from "./forms";

// Auth state must be evaluated per request, never statically cached.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasActiveAdmin())) redirect("/welcome");
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const pending = await getPreAuthUserId();

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold">
            J
          </div>
          <h1 className="text-xl font-semibold">JonDash</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {pending ? "Two-factor authentication" : "Sign in to continue"}
          </p>
        </div>
        <div className="card p-6">{pending ? <SecondFactorForm /> : <PasswordForm />}</div>
        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          Access is provided by your administrator.
        </p>
      </div>
    </main>
  );
}
