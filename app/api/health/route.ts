import { NextResponse } from "next/server";
import { SERVER_BOOT_TIME } from "@/lib/boot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public liveness probe. Deliberately unauthenticated and dependency-free so a
 * client that just triggered a restart/update can poll it to tell when the server
 * is back — and, via `boot`, that it's the *new* process (the value changes on
 * every restart), not the old one still winding down. Reveals nothing sensitive.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, boot: SERVER_BOOT_TIME },
    { headers: { "Cache-Control": "no-store" } },
  );
}
