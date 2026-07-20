"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { writeEmailConfig, type EmailConfig } from "@/lib/email/config";
import { sendTestEmail } from "@/lib/email/send";

// Email configuration holds credentials and can send mail as the org — ADMIN only.

export type EmailState = { error?: string; ok?: boolean; testOk?: boolean; testResult?: string };

const emailSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["password", "oauth2"]),
  fromName: z.string().trim().max(120),
  fromAddress: z.string().trim().max(254),
  user: z.string().trim().max(254),
  host: z.string().trim().max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  provider: z.enum(["google", "microsoft", ""]),
});

export async function saveEmailConfigAction(_prev: EmailState, formData: FormData): Promise<EmailState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const parsed = emailSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    mode: String(formData.get("mode") ?? "password"),
    fromName: String(formData.get("fromName") ?? ""),
    fromAddress: String(formData.get("fromAddress") ?? ""),
    user: String(formData.get("user") ?? ""),
    host: String(formData.get("host") ?? ""),
    port: String(formData.get("port") ?? "587"),
    secure: formData.get("secure") === "on",
    provider: String(formData.get("provider") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  // All non-secret fields are always in the form (both mode groups are rendered),
  // so they round-trip without clobbering. Client ID isn't secret; always set it.
  const patch: Partial<EmailConfig> = {
    ...parsed.data,
    oauthClientId: String(formData.get("oauthClientId") ?? "").trim(),
  };
  // Secrets: only overwrite when a new value is typed (blank keeps the stored one).
  const password = String(formData.get("password") ?? "");
  if (password) patch.password = password;
  const clientSecret = String(formData.get("oauthClientSecret") ?? "");
  if (clientSecret) patch.oauthClientSecret = clientSecret;

  await writeEmailConfig(patch);
  await audit("admin.email.config.update", { userId: admin.id, detail: `mode=${parsed.data.mode}` });
  revalidatePath("/admin/email");
  return { ok: true };
}

export async function sendTestEmailAction(_prev: EmailState, formData: FormData): Promise<EmailState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const to = String(formData.get("to") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { error: "Enter a valid recipient email." };

  const result = await sendTestEmail(to);
  await audit("admin.email.test", {
    userId: admin.id,
    detail: result.ok ? `sent to ${to}` : `failed: ${result.error}`.slice(0, 200),
  });
  return result.ok
    ? { testOk: true, testResult: `Test email sent to ${to}. Check the inbox.` }
    : { testOk: false, testResult: result.error };
}

export async function disconnectOAuthAction(): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await writeEmailConfig({ oauthRefreshToken: "" });
  await audit("admin.email.oauth.disconnected", { userId: admin.id });
  revalidatePath("/admin/email");
}
