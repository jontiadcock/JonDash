import { describe, it, expect } from "vitest";
import { createSecureContext } from "node:tls";
import {
  generateSelfSigned,
  describeCertificate,
  localNames,
  VALIDITY_CHOICES,
} from "@/lib/tls/certs.mjs";
import { validateByoPem } from "@/lib/tls/network";

/**
 * Self-signed certificates (1.8.0, plan item 4.1) and what the admin is told about them (OPS-07).
 *
 * **These assert the certificate is USABLE, not merely that bytes came back.** A generator that
 * produces a well-formed but wrong certificate — no server-auth usage, a name the browser won't
 * match, a key that isn't the one in the cert — fails at the next restart, on an HTTPS listener,
 * with an error most people would read as "HTTPS is broken". Handing the pair to Node's own TLS is
 * the same check the server will make.
 */
describe("self-signed certificates", () => {
  it("produces a pair Node's TLS accepts", async () => {
    const { cert, key } = await generateSelfSigned({ domain: "dash.example.com", days: 30 });
    expect(() => createSecureContext({ cert, key })).not.toThrow();
  });

  it("covers localhost and this machine's addresses, not just the domain", async () => {
    // The reason: a self-hosted dashboard is reached by LAN IP far more often than by name, and a
    // missing SAN produces a warning indistinguishable from the untrusted-issuer one.
    const { cert } = await generateSelfSigned({ domain: "dash.example.com" });
    const info = describeCertificate(cert);
    expect(info.ok).toBe(true);
    expect(info.altNames).toContain("dash.example.com");
    expect(info.altNames).toContain("localhost");
    expect(info.altNames).toContain("127.0.0.1");
  });

  it("works with no domain at all", async () => {
    // Self-signed exists for people who have no domain; requiring one would defeat the mode.
    const { cert, key } = await generateSelfSigned({});
    expect(() => createSecureContext({ cert, key })).not.toThrow();
    expect(describeCertificate(cert).ok).toBe(true);
  });

  it("honours the chosen validity", async () => {
    const { cert } = await generateSelfSigned({ days: 30 });
    const info = describeCertificate(cert);
    // 29 rather than 30: notBefore is backdated a minute for clock skew, so the floor can land a
    // day short. The assertion that matters is "about a month, not about a year".
    expect(info.daysLeft).toBeGreaterThanOrEqual(28);
    expect(info.daysLeft).toBeLessThanOrEqual(30);
  });

  it("is not a CA certificate", async () => {
    /*
     * A self-signed cert the user is about to click "trust" on must not also be able to vouch for
     * other sites. `createSelfSigned` will happily set BasicConstraints(true) — acme-client's own
     * ALPN helper does exactly that — so this is a real thing to get wrong, and the consequence is
     * a trusted CA on the user's machine rather than a trusted site.
     */
    const { cert } = await generateSelfSigned({ domain: "dash.example.com" });
    const pem = cert.toString();
    const { X509Certificate } = await import("node:crypto");
    const parsed = new X509Certificate(pem);
    expect(parsed.ca).toBe(false);
  });

  it("reports an expired certificate as expired", async () => {
    // Generated with a negative lifetime so notAfter is in the past.
    const { cert } = await generateSelfSigned({ days: -1 });
    const info = describeCertificate(cert);
    expect(info.expired).toBe(true);
  });

  it("says so rather than throwing when handed something that isn't a certificate", () => {
    const info = describeCertificate("hello, I am not a certificate");
    expect(info.ok).toBe(false);
    expect(info.error).toBeTruthy();
  });

  it("offers the six validity choices the owner asked for", () => {
    expect(VALIDITY_CHOICES.map((v) => v.days)).toEqual([30, 90, 180, 365, 1095, 2555]);
  });

  it("never returns an empty name list", () => {
    const { dns, ips } = localNames("");
    expect(dns).toContain("localhost");
    expect(ips).toContain("127.0.0.1");
  });
});

describe("importing a bring-your-own certificate", () => {
  it("accepts a matching pair", async () => {
    const { cert, key } = await generateSelfSigned({ domain: "dash.example.com" });
    expect(validateByoPem(cert.toString(), key.toString())).toEqual({ ok: true });
  });

  it("refuses a key that belongs to a different certificate", async () => {
    // The single most likely import mistake, and the one that otherwise surfaces as a failed
    // startup hours later.
    const a = await generateSelfSigned({ domain: "a.example.com" });
    const b = await generateSelfSigned({ domain: "b.example.com" });
    const res = validateByoPem(a.cert.toString(), b.key.toString());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/don't match/i);
  });

  it("refuses files that aren't PEM at all, naming which one", () => {
    const notPem = "PK this is a zip";
    const res = validateByoPem(notPem, notPem);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/certificate file isn't PEM/i);
  });

  it("refuses a certificate pasted in where the key belongs", async () => {
    const { cert } = await generateSelfSigned({ domain: "dash.example.com" });
    const res = validateByoPem(cert.toString(), cert.toString());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/key file isn't PEM/i);
  });
});
