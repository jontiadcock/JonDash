import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getPreAuthUserId } from "@/lib/auth/preauth";
import { hasActiveAdmin } from "@/lib/auth/bootstrap";
import { getLoginMessage } from "@/lib/settings";
import { PasswordForm, SecondFactorForm } from "./forms";
import { BrandHeading } from "@/app/components/branding";

// Auth state must be evaluated per request, never statically cached.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasActiveAdmin())) redirect("/welcome");
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const pending = await getPreAuthUserId();
  const loginMessage = await getLoginMessage();

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <BrandHeading subtitle={pending ? "Two-factor authentication" : "Sign in to continue"} />
        {loginMessage && (
          <div
            className="card mb-4 p-4 text-sm"
            style={{ color: "var(--muted)" }}
          >
            {loginMessage}
          </div>
        )}
        <div className="card p-6">{pending ? <SecondFactorForm /> : <PasswordForm />}</div>
        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          Access is provided by your administrator.
        </p>
      </div>
    </main>
  );
}
