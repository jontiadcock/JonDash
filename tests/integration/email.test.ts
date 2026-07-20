import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  readEmailConfig,
  writeEmailConfig,
  EMAIL_DEFAULTS,
  PROVIDER_PRESETS,
} from "@/lib/email/config";
import { buildAuthUrl, OAUTH_PROVIDERS } from "@/lib/email/oauth";
import { sendMail } from "@/lib/email/send";
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
