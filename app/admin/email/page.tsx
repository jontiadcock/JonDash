import { requireAdmin } from "@/lib/auth/guards";
import { getRequestOrigin } from "@/lib/request";
import { readEmailConfig } from "@/lib/email/config";
import { EmailSettings } from "./ui";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  state: "Security check failed — start the connection again.",
  oauth_config: "Save your provider, client ID and client secret first, then connect.",
  exchange_failed: "Could not complete the connection with the provider.",
};

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const cfg = await readEmailConfig();
  const origin = await getRequestOrigin();
  const sp = await searchParams;

  // Never send secrets to the client — pass only presence flags for them.
  const view = {
    enabled: cfg.enabled,
    mode: cfg.mode,
    fromName: cfg.fromName,
    fromAddress: cfg.fromAddress,
    user: cfg.user,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    provider: cfg.provider,
    oauthClientId: cfg.oauthClientId,
    hasPassword: !!cfg.password,
    hasClientSecret: !!cfg.oauthClientSecret,
    oauthConnected: !!cfg.oauthRefreshToken,
  };

  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? sp.error : null;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Email</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Configure an outgoing mail account so JonDash can send email. Supports a standard SMTP
          username + app password, or OAuth2 for Google and Microsoft. Only full admins can change this.
        </p>
      </section>

      {sp.connected && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}
        >
          Connected to the provider. Send a test email below to confirm it works.
        </div>
      )}
      {errorMsg && <p className="form-error">{errorMsg}</p>}

      <section className="card p-6">
        <EmailSettings config={view} redirectUri={`${origin}/admin/email/oauth/callback`} adminEmail={admin.email} />
      </section>
    </div>
  );
}
