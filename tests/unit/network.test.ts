import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redact } from "@/scripts/log.mjs";
import {
  readNetworkConfig,
  writeNetworkConfig,
  DEFAULTS,
} from "@/lib/tls/network-config.mjs";
import { parseAndSaveNetworkConfig, validateByoCert } from "@/lib/tls/network";

// parseAndSaveNetworkConfig writes .data/network.json in the project cwd; snapshot
// and restore so the test never disturbs a real local config.
const NET = path.join(process.cwd(), ".data", "network.json");
const backup = fs.existsSync(NET) ? fs.readFileSync(NET) : null;
afterAll(() => {
  if (backup) fs.writeFileSync(NET, backup);
  else fs.rmSync(NET, { force: true });
});

describe("log redaction", () => {
  it("masks a 64-hex encryption key", () => {
    const key = "a".repeat(64);
    expect(redact(`bare ${key} here`)).not.toContain(key);
  });
  it("masks KEY/SECRET/TOKEN/PASSWORD assignments", () => {
    expect(redact("ENCRYPTION_KEY=deadbeef")).toBe("ENCRYPTION_KEY=[REDACTED]");
    expect(redact("password=hunter2")).toContain("[REDACTED]");
    expect(redact("password=hunter2")).not.toContain("hunter2");
  });
  it("collapses a PEM block", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nAAAA\nBBBB\n-----END PRIVATE KEY-----";
    expect(redact(pem)).toBe("[REDACTED PEM]");
  });
  it("keeps output single-line and bounded", () => {
    expect(redact("a\nb\r\nc")).toBe("a b c");
    expect(redact("x".repeat(5000)).length).toBeLessThanOrEqual(2000);
  });
});

describe("network-config read/write", () => {
  it("returns HTTP-on-3000 defaults when nothing is stored", () => {
    fs.rmSync(NET, { force: true });
    const c = readNetworkConfig();
    expect(c.mode).toBe("off");
    expect(c.httpPort).toBe(DEFAULTS.httpPort);
  });
  it("coerces an invalid mode/port back to safe values", () => {
    writeNetworkConfig({ mode: "bogus", httpPort: 999999, httpsPort: 443, domain: "", email: "", certPath: "", keyPath: "" });
    const c = readNetworkConfig();
    expect(c.mode).toBe("off");
    expect(c.httpPort).toBe(3000); // out-of-range port fell back to the off-mode default
  });
});

describe("parseAndSaveNetworkConfig", () => {
  const base = { httpPort: "80", httpsPort: "443", domain: "", email: "", certPath: "", keyPath: "" };

  it("accepts off mode", () => {
    expect(parseAndSaveNetworkConfig({ ...base, mode: "off", httpPort: "3000" })).toEqual({ ok: true });
  });

  it("rejects an out-of-range port", () => {
    const r = parseAndSaveNetworkConfig({ ...base, mode: "off", httpPort: "70000" });
    expect(r.ok).toBe(false);
  });

  it("requires a domain for Let's Encrypt", () => {
    const r = parseAndSaveNetworkConfig({ ...base, mode: "letsencrypt", domain: "" });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error.toLowerCase()).toContain("domain");
  });

  it("rejects a domain that includes a scheme or path", () => {
    expect(parseAndSaveNetworkConfig({ ...base, mode: "letsencrypt", domain: "https://x.com" }).ok).toBe(false);
    expect(parseAndSaveNetworkConfig({ ...base, mode: "letsencrypt", domain: "x.com/path" }).ok).toBe(false);
  });

  it("accepts a bare domain for Let's Encrypt", () => {
    expect(parseAndSaveNetworkConfig({ ...base, mode: "letsencrypt", domain: "dash.example.com" })).toEqual({ ok: true });
  });

  it("rejects an invalid contact email", () => {
    expect(parseAndSaveNetworkConfig({ ...base, mode: "letsencrypt", domain: "dash.example.com", email: "not-an-email" }).ok).toBe(false);
  });

  it("requires both cert and key paths for BYO", () => {
    expect(parseAndSaveNetworkConfig({ ...base, mode: "byo", certPath: "/only/cert" }).ok).toBe(false);
  });
});

describe("validateByoCert", () => {
  it("errors when files are missing", () => {
    expect(validateByoCert("nope.pem", "nada.pem").ok).toBe(false);
  });
  it("errors on non-matching / invalid PEM", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "byo-"));
    const c = path.join(dir, "c.pem");
    const k = path.join(dir, "k.pem");
    fs.writeFileSync(c, "not a certificate");
    fs.writeFileSync(k, "not a key");
    expect(validateByoCert(c, k).ok).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
