import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { getUpdateStatus, requestUpdateRestart } from "@/lib/update";
import { clearUpdateFailure } from "@/lib/update-prefs";

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
  if (!status.supported) {
    return NextResponse.json(
      { ok: false, error: status.reason ?? "Auto-update isn't configured on this machine." },
      { status: 400 },
    );
  }
  if (!status.updateAvailable) {
    return NextResponse.json({ ok: false, error: "Already up to date." }, { status: 400 });
  }

  await audit("admin.update.apply", {
    userId: user.id,
    detail: `${status.current} -> ${status.latest}`,
  });
  // A manual update clears any prior "update failed" marker so this version can be
  // retried (and so the notice goes away once the retry succeeds).
  clearUpdateFailure();
  requestUpdateRestart(); // schedules process exit; launcher downloads + rebuilds + restarts
  return NextResponse.json({ ok: true });
}
