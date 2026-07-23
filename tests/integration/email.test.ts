import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  readEmailConfig,
  writeEmailConfig,
  isEmailConfigured,
  EMAIL_DEFAULTS,
  PROVIDER_PRESETS,
} from "@/lib/email/config";
import { buildAuthUrl, OAUTH_PROVIDERS } from "@/lib/email/oauth";
import { sendMail, describeTarget, explainMailError } from "@/lib/email/send";
import { resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const KEY = { scope: "global", ownerId: "", key: "email.config" };

describe("email config store", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await readEmailConfig()).toEqual(EMAIL_DEFAULTS);
  });

  it("merges patches — a later write keeps prior secrets", async () => {
    await writeEmailConfig({ mode: "password", host: "smtp.x.com", user: "a@x.com", password: "secretpw" });
    await writeEmailConfig({ fromName: "Team" }); // no password in this patch
    const c = await readEmailConfig();
    expect(c.host).toBe("smtp.x.com");
    expect(c.fromName).toBe("Team");
    expect(c.password).toBe("secretpw"); // preserved
  });

  it("encrypts the row — no plaintext secret on disk", async () => {
    await writeEmailConfig({ password: "plaintext-pw-123", oauthClientSecret: "clientsecret-xyz" });
    const row = await prisma.setting.findUnique({ where: { scope_ownerId_key: KEY } });
    expect(row?.secret).toBe(true);
    expect(row?.valueJson).not.toContain("plaintext-pw-123");
    expect(row?.valueJson).not.toContain("clientsecret-xyz");
    // …but it decrypts back correctly.
    expect((await readEmailConfig()).password).toBe("plaintext-pw-123");
  });
});

describe("oauth url building + presets", () => {
  it("Google auth URL: offline access + mail scope + code flow", () => {
    const url = new URL(buildAuthUrl("google", "cid", "https://app.example/cb", "st8"));
    expect(url.origin + url.pathname).toBe(OAUTH_PROVIDERS.google.authorizeUrl);
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("mail.google.com");
  });

  it("Microsoft auth URL: SMTP.Send + offline_access", () => {
    const url = new URL(buildAuthUrl("microsoft", "cid", "https://app.example/cb", "st"));
    expect(url.searchParams.get("scope")).toContain("SMTP.Send");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });

  it("provider presets map to the right host/port/secure", () => {
    expect(PROVIDER_PRESETS.gmail).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true });
    expect(PROVIDER_PRESETS.outlook.host).toBe("smtp-mail.outlook.com");
  });
});

describe("send guards (no network)", () => {
  it("fails cleanly when SMTP host is missing", async () => {
    const r = await sendMail({ to: "x@y.com", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("host");
  });

  it("fails cleanly in oauth2 mode with no refresh token", async () => {
    await writeEmailConfig({ mode: "oauth2", provider: "google", oauthClientId: "c", user: "a@g.com" });
    const r = await sendMail({ to: "x@y.com", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("connect");
  });
});

/**
 * Relay mode (2026-07-23). Reported by the owner: an IP-authorised relay that advertises no
 * AUTH at all had no way to be configured — `isEmailConfigured` demanded a username, and
 * `buildTransport` attached credentials whenever one was set.
 */
describe("relay mode — no authentication", () => {
  it("is configured without a username, but needs a From address", () => {
    const relay = { ...EMAIL_DEFAULTS, mode: "relay" as const, host: "relay.lan" };
    // No account to sign in with, so a username must NOT be required...
    expect(isEmailConfigured({ ...relay, fromAddress: "dash@example.com" })).toBe(true);
    // ...but with no account there is nothing to fall back on for the sender.
    expect(isEmailConfigured(relay)).toBe(false);
    // Password mode is unchanged: it still requires the account.
    expect(isEmailConfigured({ ...EMAIL_DEFAULTS, host: "smtp.x.com" })).toBe(false);
  });

  it("still requires a host", () => {
    expect(isEmailConfigured({ ...EMAIL_DEFAULTS, mode: "relay", fromAddress: "d@x.com" })).toBe(false);
  });

  it("names the target so a STALE SAVED host is visible in the error", () => {
    // The test button uses the SAVED config, not what's on screen. Without the target in
    // the message, "unable to get local issuer certificate" gives no way to tell whether
    // it even tried the host you are looking at.
    const t = describeTarget({ ...EMAIL_DEFAULTS, mode: "relay", host: "relay.lan", port: 25 });
    expect(t).toContain("relay.lan:25");
    expect(t).toContain("no authentication");
    expect(t).toContain("STARTTLS");

    const pw = describeTarget({ ...EMAIL_DEFAULTS, host: "smtp.x.com", port: 465, secure: true, user: "a@x.com" });
    expect(pw).toContain("smtp.x.com:465");
    expect(pw).toContain("TLS on connect");
    expect(pw).toContain("a@x.com");
  });
});

/**
 * The untrusted-certificate escape hatch (2026-07-23). Needed for an internal smarthost with a
 * private CA, but it switches off the proof that we're talking to the right server — so the
 * tests here are about it staying CONTAINED, not about it working.
 */
describe("allowUntrustedCert — opt-in, contained, and visible", () => {
  it("is off unless explicitly turned on", async () => {
    expect(EMAIL_DEFAULTS.allowUntrustedCert).toBe(false);
    // A config saved before this option existed must not silently gain it.
    await writeEmailConfig({ mode: "relay", host: "relay.lan" });
    expect((await readEmailConfig()).allowUntrustedCert).toBe(false);
  });

  it("round-trips when set", async () => {
    await writeEmailConfig({ allowUntrustedCert: true });
    expect((await readEmailConfig()).allowUntrustedCert).toBe(true);
    await writeEmailConfig({ allowUntrustedCert: false });
    expect((await readEmailConfig()).allowUntrustedCert).toBe(false);
  });

  it("says so in every result, so a weakened connection can't be forgotten", () => {
    const on = describeTarget({
      ...EMAIL_DEFAULTS, mode: "relay", host: "relay.lan", port: 25, allowUntrustedCert: true,
    });
    expect(on).toContain("certificate NOT verified");

    const off = describeTarget({ ...EMAIL_DEFAULTS, mode: "relay", host: "relay.lan", port: 25 });
    expect(off).not.toContain("NOT verified");
  });

  it("NEVER touches the global TLS switch", async () => {
    // Disabling verification process-wide would also weaken update downloads and module
    // installs. The flag must only ever reach this one transport.
    await writeEmailConfig({ mode: "relay", host: "relay.lan", allowUntrustedCert: true });
    await sendMail({ to: "x@y.com", subject: "s", text: "t" }).catch(() => {});
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });
});

describe("mail error explanations", () => {
  it("maps the TLS-on-connect-to-a-plaintext-port mistake to the checkbox", () => {
    const out = explainMailError("SSL routines:tls_validate_record_header:wrong version number");
    expect(out).toContain("Use TLS on connect");
    expect(out).toContain("465");
  });

  it("explains an untrusted certificate AND points at the saved settings", () => {
    const out = explainMailError("unable to get local issuer certificate");
    expect(out).toContain("trusted authority");
    expect(out).toMatch(/saved/i);
  });

  it("points a server that offers no AUTH at relay mode", () => {
    const out = explainMailError("No supported authentication method(s) available");
    expect(out).toContain("Mail relay");
  });

  it("explains a relay that refuses the recipient", () => {
    expect(explainMailError("550 5.7.64 TenantAttribution; Relay Access Denied")).toContain("relay");
  });

  it("passes an unrecognised error through unchanged rather than guessing", () => {
    expect(explainMailError("something entirely new")).toBe("something entirely new");
  });
});
