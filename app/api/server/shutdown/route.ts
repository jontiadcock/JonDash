import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { SERVER_BOOT_TIME } from "@/lib/boot";
import { requestServerShutdown } from "@/lib/server-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: shut the server down for good via the supervised launcher. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await assertSameOrigin();

  await audit("admin.server.shutdown", { userId: user.id });
  const res = NextResponse.json({ ok: true, boot: SERVER_BOOT_TIME });
  requestServerShutdown();
  return res;
}
