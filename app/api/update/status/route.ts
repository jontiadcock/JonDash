import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUpdateStatus } from "@/lib/update";

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
  return NextResponse.json(status);
}
