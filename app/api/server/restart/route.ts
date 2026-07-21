import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { SERVER_BOOT_TIME } from "@/lib/boot";
import { requestServerRestart } from "@/lib/server-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: restart the server via the supervised launcher (no rebuild). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await assertSameOrigin();

  await audit("admin.server.restart", { userId: user.id });
  // Return the current boot first so the client can detect the *new* process once
  // it reconnects, then schedule the exit.
  const res = NextResponse.json({ ok: true, boot: SERVER_BOOT_TIME });
  requestServerRestart();
  return res;
}
