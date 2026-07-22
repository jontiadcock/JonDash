import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (formerly "middleware") responsibilities:
 *  1. Attach hardened security headers (incl. a nonce-based CSP in production).
 *  2. Lightweight auth gate: redirect anonymous requests away from protected
 *     areas. This is a UX guard only — real authz happens in requireUser /
 *     requireAdmin on the server for every protected page and action.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/account", "/m"];

// Cookie name mirrors lib/auth/session.ts.
const SESSION_COOKIE = "dashboard_session";

function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

function buildCsp(nonce: string, isHttps: boolean): string {
  const isProd = process.env.NODE_ENV === "production";
  // Dev needs 'unsafe-eval'/'unsafe-inline' for React Fast Refresh (HMR).
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'unsafe-eval' 'unsafe-inline'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Tailwind/Next inject inline styles; allow inline styles only.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `manifest-src 'self'`,
    // Only upgrade subresources when actually served over HTTPS. Emitting this
    // over plain HTTP (e.g. a LAN IP like 192.168.x.x) makes the browser upgrade
    // CSS/JS to https:// where no server exists, breaking all styling/scripts.
    isHttps ? `upgrade-insecure-requests` : ``,
  ]
    .filter(Boolean)
    .join("; ");
}

function applySecurityHeaders(res: NextResponse, csp: string, isHttps: boolean) {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");
  if (isHttps) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = generateNonce();
  const isHttps =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
    request.nextUrl.protocol === "https:";
  const csp = buildCsp(nonce, isHttps);

  // Auth gate for protected areas.
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isProtected && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirectRes = NextResponse.redirect(url);
    applySecurityHeaders(redirectRes, csp, isHttps);
    return redirectRes;
  }

  // Pass the nonce down so Next.js can apply it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(res, csp, isHttps);
  return res;
}

export const config = {
  // Run on everything except Next internals and common static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff|woff2)$).*)",
  ],
};
