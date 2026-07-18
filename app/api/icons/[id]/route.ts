import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { readIcon } from "@/lib/icons";
import { canViewLink } from "@/lib/services";

export const runtime = "nodejs";

/**
 * Serves an uploaded icon by link id. Enforces authentication and ownership:
 * a user may only read icons for their own links (admins may read any). Files
 * live outside the web root and are streamed with hardened headers.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const link = await prisma.link.findUnique({ where: { id } });
  if (!link || !link.iconPath) return new NextResponse("Not found", { status: 404 });
  if (!(await canViewLink(user, link))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const data = await readIcon(link.iconPath);
  if (!data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
