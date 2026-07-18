import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUpdateStatus } from "@/lib/update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: is a newer version available on GitHub? */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const status = await getUpdateStatus();
  return NextResponse.json(status);
}
