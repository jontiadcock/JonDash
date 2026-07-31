"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { parseAndSaveNetworkConfig, readNetworkConfig, validateByoPem } from "@/lib/tls/network";
import {
  generateSelfSigned,
  writePair,
  describeCertificate,
  SELF_CERT_FILE,
  SELF_KEY_FILE,
  BYO_CERT_FILE,
  BYO_KEY_FILE,
} from "@/lib/tls/certs.mjs";
import { writeTlsStatus } from "@/lib/tls/network-config.mjs";

/*
 * Network / HTTPS configuration is sensitive (it can lock people out or change how
 * the server is exposed), so it's gated by the `network.manage` capability (full
 * admins have it; it can be delegated via an access role).
 */

/**
 * REFS app/admin/network/cert-panel.tsx · app/admin/network/public-address.tsx
 *      app/admin/network/ui.tsx
 */
export type NetworkState = { error?: string; ok?: boolean; message?: string };

/**
 * Save the public address (moved here from General in 1.8.3, owner request).
 *
 * Separate from `saveNetworkConfigAction` because they write to different places — that one to
 * `.data/network.json`, this one to the settings table. `applySettingsForm` is given only the
 * `network` group's keys, so this action cannot write a setting belonging to any other page.
 *
 * ## Related code
 * - `lib/settings.ts` — the `network` group and `app.publicUrl`'s schema.
 * - `app/admin/network/public-address.tsx` — the form.
 * - `lib/app-url.ts` — the consumer, and why blank means "omit the link".
 * REFS app/admin/network/public-address.tsx
 */
export async function savePublicAddressAction(
  _prev: NetworkState,
  formData: FormData,
): Promise<NetworkState> {
  await assertSameOrigin();
  const admin = await requirePermission("network.manage");

  const { applySettingsFormDetailed, settingKeysByGroup } = await import("@/lib/settings");
  const { errors, changed } = await applySettingsFormDetailed(
    formData,
    settingKeysByGroup("network"),
  );
  const first = Object.values(errors)[0];
  if (first) return { error: first };

  // Named, not counted — a bare "settings.updated" records that something changed and never what
  // (BUG-24).
  if (changed.length) {
    await audit("admin.settings.update", { userId: admin.id, detail: changed.join(", ") });
  }
  revalidatePath("/admin/network");
  return { ok: true };
}

/** REFS app/admin/network/ui.tsx */
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
    selfSignedDays: String(formData.get("selfSignedDays") ?? "365"),
  };

  const res = parseAndSaveNetworkConfig(input);
  if (!res.ok) return { error: res.error };

  await audit("admin.network.update", { userId: admin.id, detail: `mode=${input.mode}` });
  revalidatePath("/admin/network");
  return { ok: true };
}

/**
 * Generate a self-signed certificate now (4.1 / OPS-08).
 *
 * **Generating and applying are deliberately separate.** Making one takes a second and changes
 * nothing that is being served; applying it means rebinding the HTTPS listener, which is a restart
 * and signs everyone out. Doing both on one button press would make "let me see what this does"
 * cost every signed-in user their session.
 * REFS app/admin/network/cert-panel.tsx
 */
export async function generateSelfSignedAction(
  _prev: NetworkState,
  formData: FormData,
): Promise<NetworkState> {
  await assertSameOrigin();
  const admin = await requirePermission("network.manage");

  const cfg = readNetworkConfig();
  const days = Number(formData.get("selfSignedDays") ?? cfg.selfSignedDays) || cfg.selfSignedDays;
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return { error: "Choose how long the certificate should last." };
  }

  try {
    const { cert, key, names, notAfter } = await generateSelfSigned({ domain: cfg.domain, days });
    writePair(SELF_CERT_FILE, SELF_KEY_FILE, cert, key);
    writeTlsStatus({
      state: "ok",
      domain: cfg.domain,
      issuer: "self-signed",
      notAfter: notAfter.toISOString(),
      lastRenewal: new Date().toISOString(),
      lastError: "",
    });
    await audit("admin.network.selfsigned", {
      userId: admin.id,
      detail: `generated for ${names.length} name(s), valid ${days} days`,
    });
    revalidatePath("/admin/network");
    return {
      ok: true,
      message: `Certificate created, covering ${names.join(", ")}. Restart to start serving it.`,
    };
  } catch (e) {
    // Verbatim, per OPS-08: a generation failure the admin can't read is one they can't fix.
    return { error: `Couldn't create the certificate: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Import a certificate and key the admin already has (4.2).
 *
 * **Copied in, not referenced where they sit.** A path is a promise about a file that JonDash
 * doesn't control: it can be moved, permission-changed, or sit on a drive that mounts late, and the
 * failure appears at boot as "no HTTPS" long after the admin has forgotten. Copying into
 * `.data/tls/` at 0600 puts the material under the same care as the ACME key that already lives
 * there, and makes it part of what a backup and a restore carry.
 * REFS app/admin/network/cert-panel.tsx
 */
export async function importCertAction(
  _prev: NetworkState,
  formData: FormData,
): Promise<NetworkState> {
  await assertSameOrigin();
  const admin = await requirePermission("network.manage");

  const certFile = formData.get("certFile");
  const keyFile = formData.get("keyFile");
  if (!(certFile instanceof File) || !(keyFile instanceof File) || !certFile.size || !keyFile.size) {
    return { error: "Choose both a certificate file and a private key file." };
  }
  // PEM is text and small. A cap here stops an accidental 2 GB pick being read into memory.
  if (certFile.size > 512 * 1024 || keyFile.size > 512 * 1024) {
    return { error: "That file is too large to be a PEM certificate or key (limit 512 KB)." };
  }

  const cert = Buffer.from(await certFile.arrayBuffer()).toString("utf8");
  const key = Buffer.from(await keyFile.arrayBuffer()).toString("utf8");

  const valid = validateByoPem(cert, key);
  if (!valid.ok) return { error: valid.error };

  const info = describeCertificate(cert);
  writePair(BYO_CERT_FILE, BYO_KEY_FILE, cert, key);

  // The old path fields are cleared: two sources for one certificate is how an install ends up
  // serving something other than what the page shows.
  const cfg = readNetworkConfig();
  parseAndSaveNetworkConfig({ ...cfg, mode: "byo", certPath: "", keyPath: "" });

  await audit("admin.network.import-cert", {
    userId: admin.id,
    detail: info.ok ? `issuer=${info.issuer || "unknown"} expires=${info.notAfter}` : "imported",
  });
  revalidatePath("/admin/network");

  const expiredNote =
    info.ok && info.expired ? " Note: this certificate has already expired." : "";
  return { ok: true, message: `Certificate imported.${expiredNote} Restart to start serving it.` };
}

/**
 * Ask Let's Encrypt for a certificate now, without restarting (OPS-08).
 *
 * Issuance used to happen only at boot, so the sequence for a new domain was "save, restart, hope,
 * read the log". This runs the same code from here and reports what came back. The HTTP-01
 * challenge is answered by the plain-HTTP listener in `server.mjs`, which cannot see this process's
 * variables — hence the on-disk challenge store.
 * REFS app/admin/network/cert-panel.tsx
 */
export async function requestCertificateAction(
  _prev: NetworkState,
  _formData: FormData,
): Promise<NetworkState> {
  await assertSameOrigin();
  const admin = await requirePermission("network.manage");

  const cfg = readNetworkConfig();
  if (cfg.mode !== "letsencrypt") return { error: "Switch to Let's Encrypt and save first." };
  if (!cfg.domain) return { error: "Set the domain you want a certificate for, and save first." };

  const { obtainCertificate } = await import("@/lib/tls/acme.mjs");
  const { putChallenge, removeChallenge, clearChallenges } = await import(
    "@/lib/tls/challenge-store.mjs"
  );

  // An adapter with the Map shape obtainCertificate expects, backed by the shared directory.
  const challengeMap = {
    set: (token: string, keyAuth: string) => putChallenge(token, keyAuth),
    delete: (token: string) => removeChallenge(token),
  };

  try {
    await obtainCertificate({
      domain: cfg.domain,
      email: cfg.email,
      challengeMap,
      log: () => {},
    });
    await audit("admin.network.cert-issued", { userId: admin.id, detail: cfg.domain });
    revalidatePath("/admin/network");
    return {
      ok: true,
      message: `Certificate issued for ${cfg.domain}. Restart to start serving it.`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    writeTlsStatus({ state: "error", lastError: message });
    await audit("admin.network.cert-failed", { userId: admin.id, detail: message.slice(0, 200) });
    revalidatePath("/admin/network");
    /*
     * Verbatim (OPS-08/OPS-13's rule applied here): Let's Encrypt's own wording names the actual
     * problem — the wrong A record, port 80 unreachable, a rate limit — and paraphrasing it into
     * "certificate request failed" throws away the only diagnosis available.
     */
    return { error: `Let's Encrypt refused the request: ${message}` };
  } finally {
    clearChallenges();
  }
}
