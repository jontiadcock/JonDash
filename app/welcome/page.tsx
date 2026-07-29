import { redirect } from "next/navigation";
import { hasActiveAdmin, getPendingAdmin } from "@/lib/auth/bootstrap";

// Auth state must be evaluated per request, never statically cached.
export const dynamic = "force-dynamic";
import { decryptString } from "@/lib/crypto";
import { buildTotpEnrolment } from "@/lib/auth/totp";
import { WelcomeCreateForm, WelcomeConfirmForm, WelcomeRestoreForm } from "./forms";
import { welcomeRestartAction } from "./actions";

export default async function WelcomePage() {
  // Once an admin exists this wizard is closed for good.
  if (await hasActiveAdmin()) redirect("/login");

  const pending = await getPendingAdmin();
  const step2 = Boolean(pending?.totpSecretEnc);

  let qrDataUrl = "";
  let secret = "";
  if (pending?.totpSecretEnc) {
    secret = decryptString(pending.totpSecretEnc);
    ({ qrDataUrl } = await buildTotpEnrolment(pending.email, secret));
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold">
            J
          </div>
          <h1 className="text-xl font-semibold">Welcome — let’s set up your dashboard</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {step2
              ? "Step 2 of 2 · Secure your account with an authenticator app"
              : "Step 1 of 2 · Create your administrator account"}
          </p>
        </div>
        <div className="card p-6">
          {step2 ? <WelcomeConfirmForm qrDataUrl={qrDataUrl} secret={secret} /> : <WelcomeCreateForm />}
        </div>
        {!step2 && (
          <div className="mt-4 text-center">
            <WelcomeRestoreForm />
          </div>
        )}
        {step2 && (
          <form action={welcomeRestartAction} className="mt-4 text-center">
            <button type="submit" className="text-xs underline" style={{ color: "var(--muted)" }}>
              Start over with a different email
            </button>
          </form>
        )}
        {/*
          Shown on step 1 only — the moment an account is being created, which is where the owner
          asked for it. Step 2 is enrolling an authenticator, and interrupting that with a
          disclosure about how the software was built would land at the wrong moment.

          Owner's wording, kept close to what they wrote: designed by a human, built with AI help.
          It is stated plainly rather than buried in the licence, because someone deciding whether
          to trust their services to this should be told before they create the account, not after.
        */}
        {!step2 && (
          <div
            className="mt-6 rounded-xl px-4 py-3 text-xs"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          >
            <p>
              JonDash was <strong>designed by a human</strong>, and built with the assistance of AI.
              It is offered as-is, for your own personal use — see the{" "}
              <a
                href="https://github.com/jontiadcock/JonDash/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: "var(--primary)" }}
              >
                licence
              </a>
              .
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          This one-time setup only appears until the first administrator is created.
        </p>
      </div>
    </main>
  );
}
