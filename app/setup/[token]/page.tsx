import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";
import {
  generateTotpSecret,
  encryptTotpSecret,
  buildTotpEnrolment,
} from "@/lib/auth/totp";
import { findPendingUserByToken } from "./actions";
import { SetupForm } from "./form";

export default async function SetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await findPendingUserByToken(token);

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-sm p-8 text-center">
          <h1 className="text-lg font-semibold">Link expired</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            This setup link is invalid or has expired. Please ask your administrator for a new
            one.
          </p>
        </div>
      </main>
    );
  }

  // Ensure a TOTP secret exists (idempotent so refreshing keeps the same QR).
  let secret: string;
  if (user.totpSecretEnc) {
    secret = decryptString(user.totpSecretEnc);
  } else {
    secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecretEnc: encryptTotpSecret(secret) },
    });
  }

  const { qrDataUrl } = await buildTotpEnrolment(user.email, secret);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Set up your account</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {user.email}
          </p>
        </div>
        <div className="card p-6">
          <SetupForm token={token} qrDataUrl={qrDataUrl} secret={secret} />
        </div>
      </div>
    </main>
  );
}
