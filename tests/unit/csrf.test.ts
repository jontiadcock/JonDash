import { describe, it, expect, beforeEach, vi } from "vitest";

// A mutable header store the mocked next/headers reads from.
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => store.get(k.toLowerCase()) ?? null,
  }),
}));

import { assertSameOrigin } from "@/lib/security/csrf";

describe("assertSameOrigin (CSRF guard)", () => {
  beforeEach(() => store.clear());

  it("passes when Origin matches the host", async () => {
    store.set("host", "dash.example.com");
    store.set("origin", "https://dash.example.com");
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("rejects a cross-origin request", async () => {
    store.set("host", "dash.example.com");
    store.set("origin", "https://evil.example.com");
    await expect(assertSameOrigin()).rejects.toThrow(/cross-origin/i);
  });

  it("falls back to Referer when Origin is absent", async () => {
    store.set("host", "dash.example.com");
    store.set("referer", "https://dash.example.com/admin");
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("rejects when neither Origin nor Referer is present", async () => {
    store.set("host", "dash.example.com");
    await expect(assertSameOrigin()).rejects.toThrow(/cross-origin/i);
  });
});
