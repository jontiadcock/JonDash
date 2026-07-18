import { redirect } from "next/navigation";
import { peekRevealCodes } from "@/lib/auth/recovery-reveal";
import { BackupCodesPanel } from "@/app/components/backup-codes-panel";
import { continueFromRevealAction } from "./actions";

// One-time view driven by the reveal cookie; never cache.
export const dynamic = "force-dynamic";

export default async function RecoveryCodesPage() {
  const reveal = await peekRevealCodes();
  if (!reveal) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="font-medium">Save your recovery codes</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            These one-time codes let you sign in if you lose your authenticator. They won’t be
            shown again.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <BackupCodesPanel codes={reveal.codes} />
          <form action={continueFromRevealAction}>
            <button type="submit" className="btn btn-primary w-full">
              I’ve saved them — continue
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
