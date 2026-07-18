import "server-only";

/**
 * Best-effort IP -> coarse location ("City, Country") for the session list.
 * Uses free external geo-IP providers with automatic failover and an in-memory
 * cache. Private / loopback addresses resolve locally without any external call.
 *
 * Privacy note: for public IPs, the address is sent to the external provider.
 * Results are cached to minimise calls. Lookups never throw — on any failure the
 * caller simply gets null and the UI shows the raw IP.
 */

type CacheEntry = { value: string | null; expires: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const TIMEOUT_MS = 2500;

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  if (ip === "::1" || ip.startsWith("127.") || ip === "localhost") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  // 172.16.0.0 – 172.31.255.255
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  // Unique-local / link-local IPv6
  if (/^(fc|fd|fe80)/i.test(ip)) return true;
  return false;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function fmt(city?: string | null, country?: string | null): string | null {
  const parts = [city, country].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length ? parts.join(", ") : null;
}

// Primary: ip-api.com (free, no key). Backup: ipwho.is (free, https, no key).
async function providerIpApi(ip: string): Promise<string | null> {
  const j = (await fetchJson(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`,
  )) as { status?: string; city?: string; country?: string } | null;
  if (!j || j.status !== "success") return null;
  return fmt(j.city, j.country);
}

async function providerIpWho(ip: string): Promise<string | null> {
  const j = (await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`)) as
    | { success?: boolean; city?: string; country?: string }
    | null;
  if (!j || j.success === false) return null;
  return fmt(j.city, j.country);
}

/** Resolve a coarse location for an IP. Never throws. */
export async function resolveLocation(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null;
  if (isPrivateIp(ip)) return "Local network";

  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.value;

  let value: string | null = null;
  for (const provider of [providerIpApi, providerIpWho]) {
    value = await provider(ip);
    if (value) break;
  }

  cache.set(ip, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}
