import "server-only";
import { headers } from "next/headers";

/**
 * Settings derived from the incoming request, so nothing has to be configured
 * by hand. Behind a reverse proxy these rely on X-Forwarded-* headers, which
 * nginx/Caddy set by default.
 */

/** True when the request reached us over HTTPS. */
export async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]?.trim() === "https";
  // Fallback: some setups pass the scheme on the host or via forwarded header.
  return h.get("x-forwarded-ssl") === "on";
}

/** The host the client used (proxy-aware). */
export async function getRequestHost(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

/** Absolute origin (scheme://host) the client used, for building links. */
export async function getRequestOrigin(): Promise<string> {
  const host = (await getRequestHost()) ?? "localhost:3000";
  const scheme = (await isSecureRequest()) ? "https" : "http";
  return `${scheme}://${host}`;
}
