import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUpdateStatus } from "@/lib/update";
import { countModuleUpdates } from "@/lib/modules/updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: is a newer version available on GitHub? `?force=1` bypasses the cache. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";
  const status = await getUpdateStatus(force);
  // Modules never update themselves, so the admin has to be TOLD one is waiting rather
  // than left to go looking. Reported alongside the app's own status so the existing
  // banner can surface it — including when the app itself is up to date.
  const moduleUpdates = await countModuleUpdates();
  return NextResponse.json({ ...status, moduleUpdates });
}
