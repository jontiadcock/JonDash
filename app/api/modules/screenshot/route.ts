import { requirePermission } from "@/lib/auth/guards";
import { browseAvailableModules, parseRepoUrl, type ModuleChannel } from "@/lib/modules/sources";

export const dynamic = "force-dynamic";

/** A picture, not a payload. Anything larger is a mistake or an attack, and neither needs serving. */
const MAX_BYTES = 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** GitHub is normally instant; a source that hangs must not hold a request thread open. */
const TIMEOUT_MS = 8000;

/**
 * Serve a module's screenshot, fetched from its source (8.2).
 *
 * **Proxied rather than linked, for two reasons.** The CSP is `img-src 'self'` and widening it to
 * a third-party host for decorative images would be a poor trade — it would apply to every page in
 * the app, forever. And a direct `<img src="https://raw.githubusercontent.com/…">` makes the
 * admin's *browser* talk to GitHub on every catalogue view, which tells GitHub who is looking at
 * what from which address; the server already fetches the manifest, so this keeps the traffic where
 * it already was.
 *
 * **There is no SSRF surface here, by construction.** The caller passes a module id, a channel and
 * an index — never a URL, a host or a path. The URL is built on this side from the source repo the
 * admin configured, the tag pinned in the manifest, and a filename that
 * `sanitiseScreenshots` already reduced to one segment with a known image extension. There is no
 * input that can point this at another host.
 *
 * Gated on `modules.manage`: it is the same information the Browse page shows, and no wider.
 */
export async function GET(req: Request): Promise<Response> {
  await requirePermission("modules.manage");

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const channel: ModuleChannel = url.searchParams.get("channel") === "beta" ? "beta" : "stable";
  const index = Number(url.searchParams.get("i") ?? "0");

  if (!Number.isInteger(index) || index < 0 || index > 3) {
    return new Response("Bad index", { status: 400 });
  }

  const { modules } = await browseAvailableModules(channel);
  // Not `module` — Next reserves that identifier in a route file.
  const entry = modules.find((m) => m.id === id);
  const shot = entry?.screenshots?.[index];
  if (!entry || !shot) return new Response("Not found", { status: 404 });

  const repo = parseRepoUrl(entry.sourceUrl);
  if (!repo) return new Response("Not found", { status: 404 });

  // Built here, from values this side controls. `module.path` is already pinned to `addons/<id>`
  // and `shot.file` to a single validated segment.
  const remote =
    `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/` +
    `${encodeURIComponent(entry.tag).replace(/%2F/g, "/")}/${entry.path}/${shot.file}`;

  let upstream: Response;
  try {
    upstream = await fetch(remote, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Whatever comes back is treated as bytes to be checked, never as something to trust.
      headers: { accept: "image/png,image/jpeg,image/webp" },
      cache: "no-store",
    });
  } catch {
    return new Response("Upstream unavailable", { status: 502 });
  }
  if (!upstream.ok) return new Response("Not found", { status: 404 });

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) return new Response("Not an image", { status: 415 });

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  // Checked after reading rather than trusting content-length, which is a claim.
  if (bytes.byteLength > MAX_BYTES) return new Response("Too large", { status: 413 });

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": type,
      // The tag is immutable, so the bytes behind this URL never change. `private` because the
      // whole route is behind an admin capability.
      "cache-control": "private, max-age=3600",
      // It is a third party's image being served from our origin; make sure nothing treats it as
      // anything else.
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
