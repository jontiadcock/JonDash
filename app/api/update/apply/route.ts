import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { getUpdateStatus, requestUpdateRestart } from "@/lib/update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: pull the update and restart via the supervised launcher. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await assertSameOrigin();

  const status = await getUpdateStatus(true);
  if (!status.gitRepo) {
    return NextResponse.json(
      { ok: false, error: "This copy isn't a Git clone, so it can't self-update." },
      { status: 400 },
    );
  }
  if (!status.updateAvailable) {
    return NextResponse.json({ ok: false, error: "Already up to date." }, { status: 400 });
  }

  await audit("admin.update.apply", { userId: user.id, detail: `behind ${status.behind}` });
  requestUpdateRestart(); // schedules process exit; launcher does the pull + rebuild + restart
  return NextResponse.json({ ok: true });
}
