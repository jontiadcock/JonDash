"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { parseAndSaveNetworkConfig } from "@/lib/tls/network";

// Network / HTTPS configuration is sensitive (it can lock people out or change how
// the server is exposed), so it's gated by the `network.manage` capability (full
// admins have it; it can be delegated via an access role).

export type NetworkState = { error?: string; ok?: boolean };

export async function saveNetworkConfigAction(
  _prev: NetworkState,
  formData: FormData,
): Promise<NetworkState> {
  await assertSameOrigin();
  const admin = await requirePermission("network.manage");

  const input = {
    mode: String(formData.get("mode") ?? "off"),
    httpPort: String(formData.get("httpPort") ?? ""),
    httpsPort: String(formData.get("httpsPort") ?? ""),
    domain: String(formData.get("domain") ?? ""),
    email: String(formData.get("email") ?? ""),
    certPath: String(formData.get("certPath") ?? ""),
    keyPath: String(formData.get("keyPath") ?? ""),
  };

  const res = parseAndSaveNetworkConfig(input);
  if (!res.ok) return { error: res.error };

  await audit("admin.network.update", { userId: admin.id, detail: `mode=${input.mode}` });
  revalidatePath("/admin/network");
  return { ok: true };
}
