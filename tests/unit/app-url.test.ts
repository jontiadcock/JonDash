import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { writeSetting, clearSettingsCache } from "@/lib/settings";
import { resolveAppUrl, getPublicUrl } from "@/lib/app-url";

/**
 * Links that leave JonDash (1.8.0).
 *
 * The property being pinned is a REFUSAL: with no public address configured, a link is not
 * produced. Guessing one from `x-forwarded-host` is what BUG-41 is about, and in email it is
 * materially worse than on a page — a forged header puts an attacker's link, branded as JonDash,
 * into an inbox where it is trusted and long-lived. So "no value, no link" has to be the
 * behaviour, not a fallback that quietly does something reasonable-looking.
 */
beforeEach(async () => {
  await prisma.setting.deleteMany({ where: { key: "app.publicUrl" } });
  clearSettingsCache();
});

afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: "app.publicUrl" } });
  clearSettingsCache();
  await prisma.$disconnect();
});

describe("with nothing configured", () => {
  it("produces no link rather than guessing one", async () => {
    expect(await resolveAppUrl("/m/backup-manager")).toBeNull();
    expect(await getPublicUrl()).toBe("");
  });
});

describe("with a public address set", () => {
  it("resolves a root-relative path against it", async () => {
    expect(await writeSetting("app.publicUrl", "https://dash.example.com")).toBeNull();
    clearSettingsCache();
    expect(await resolveAppUrl("/m/backup-manager")).toBe("https://dash.example.com/m/backup-manager");
  });

  it("keeps a port and drops a trailing slash", async () => {
    await writeSetting("app.publicUrl", "https://dash.example.com:8443/");
    clearSettingsCache();
    expect(await resolveAppUrl("/x")).toBe("https://dash.example.com:8443/x");
  });
});

describe("refuses anything that isn't a root-relative path", () => {
  beforeEach(async () => {
    await writeSetting("app.publicUrl", "https://dash.example.com");
    clearSettingsCache();
  });

  it("refuses a protocol-relative path", async () => {
    // `//evil.example` looks like a path and is not — it leaves the site entirely, which is the
    // one input that could turn a JonDash email into a link to somebody else's server.
    expect(await resolveAppUrl("//evil.example/x")).toBeNull();
  });

  it("refuses an absolute URL", async () => {
    expect(await resolveAppUrl("https://evil.example/x")).toBeNull();
  });

  it("refuses a bare relative path", async () => {
    expect(await resolveAppUrl("m/backup-manager")).toBeNull();
  });
});

describe("refuses a stored value that isn't a usable origin", () => {
  it("rejects a non-http scheme at the setting boundary", async () => {
    // The schema should refuse it; if it ever slipped through, normalisation refuses it too.
    expect(await writeSetting("app.publicUrl", "javascript:alert(1)")).not.toBeNull();
  });

  it("treats an unparseable stored value as unset", async () => {
    // Written straight to the row, bypassing the schema, to prove the reader is defensive on its
    // own rather than trusting that nothing ever gets in another way.
    await prisma.setting.create({
      data: { scope: "global", ownerId: "", key: "app.publicUrl", valueJson: JSON.stringify("not a url"), secret: false },
    });
    clearSettingsCache();
    expect(await resolveAppUrl("/x")).toBeNull();
  });
});
