import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { ReenrollFlow } from "./ui";

export const dynamic = "force-dynamic";

export default async function ReenrollPage() {
  await requireUser();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <section>
        <Link href="/account" className="text-sm underline" style={{ color: "var(--muted)" }}>
          ← Back to account
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Re-enrol authenticator</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Move your two-factor authentication to a new device.
        </p>
      </section>

      <section className="card p-6">
        <ReenrollFlow />
      </section>
    </div>
  );
}
