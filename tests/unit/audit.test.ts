import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { audit, auditOrThrow } from "@/lib/audit";

/**
 * REGRESSION (BUG-29, 2026-07-23). Reported by the add-ons session from Backup Manager's
 * first scheduled run: `audit()` had `await headers()` inside the SAME try as the
 * `auditLog.create`. `headers()` throws outside a request scope — which is every scheduled
 * or background action — so the throw happened before the write and the catch swallowed it.
 * No row, no error, no signal.
 *
 * It was undetectable from the outside: `audit()` returns `Promise<void>` and eats its own
 * failures, so a caller cannot tell whether anything was written, retry, or fall back.
 * Every module's scheduled work was silently unauditable.
 *
 * These tests run OUTSIDE a request scope, which is precisely the failing condition — so
 * they fail against the old implementation.
 */

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "test.bug29" } } });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "test.bug29" } } });
  await prisma.$disconnect();
});

describe("audit() from background work (no request scope)", () => {
  it("writes the row even though headers() throws", async () => {
    await audit("test.bug29.scheduled", { detail: "pruned 1 old snapshot" });

    const rows = await prisma.auditLog.findMany({ where: { action: "test.bug29.scheduled" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detail).toBe("pruned 1 old snapshot");
  });

  it("loses only the ip column, not the event", async () => {
    // The request context is optional enrichment. Absent one, ip is simply unknown —
    // that must not cost the record of what happened.
    await audit("test.bug29.noip");
    const row = await prisma.auditLog.findFirst({ where: { action: "test.bug29.noip" } });
    expect(row).not.toBeNull();
    expect(row?.ip ?? null).toBeNull();
  });

  it("still records the actor when the caller knows it", async () => {
    // Background work often acts on behalf of nobody, but when a userId IS passed
    // (e.g. a schedule created by a specific admin) it must survive.
    const user = await prisma.user.create({
      data: { email: `bug29-${Date.now()}@test.local`, role: "ADMIN", status: "ACTIVE" },
    });
    await audit("test.bug29.withuser", { userId: user.id });
    const row = await prisma.auditLog.findFirst({ where: { action: "test.bug29.withuser" } });
    expect(row?.userId).toBe(user.id);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("marks the row as system, so it isn't mistaken for an unknown actor", async () => {
    // Without this the row shows a blank actor, which reads as "we don't know who did
    // this" — a very different statement from "this ran on a schedule".
    await audit("test.bug29.source");
    const row = await prisma.auditLog.findFirst({ where: { action: "test.bug29.source" } });
    expect(row?.source).toBe("system");
  });

  it("does NOT infer background from a missing ip", async () => {
    // The tempting shortcut is "no user and no ip means the scheduler". It happens to hold
    // today, but ip comes from x-forwarded-for/x-real-ip — on a deployment that doesn't set
    // them a REAL user action would be labelled System. A row created with an explicit
    // source must keep it regardless of whether an ip is present.
    await prisma.auditLog.create({
      data: { action: "test.bug29.reqnoip", source: "request" }, // request-scoped, no ip
    });
    const row = await prisma.auditLog.findFirst({ where: { action: "test.bug29.reqnoip" } });
    expect(row?.ip).toBeNull();
    expect(row?.source).toBe("request"); // not reclassified as system
  });

  it("defaults to request, so existing rows aren't retroactively called system", async () => {
    // The backfill is sound only because the OLD audit() could not write outside a request
    // scope at all — so every pre-existing row genuinely came from a request.
    await prisma.auditLog.create({ data: { action: "test.bug29.default" } });
    const row = await prisma.auditLog.findFirst({ where: { action: "test.bug29.default" } });
    expect(row?.source).toBe("request");
  });

  it("still never throws, whatever happens", async () => {
    // The property the original catch existed to guarantee. Keeping the row must not
    // come at the cost of letting audit failures break the caller's primary flow.
    await expect(
      audit("test.bug29.safe", { userId: "no-such-user-id-violates-the-fk" }),
    ).resolves.toBeUndefined();
  });
});

/**
 * An unattributable actor must not cost the whole row (2026-07-25).
 *
 * Reported by the add-ons session with a repro on the NORMAL path: `auditLog.create` fails
 * with a foreign-key violation when `userId` doesn't resolve to a real User, `audit()`
 * swallows it, and the elevated action proceeds anyway. A grant was created and the task ran
 * with no audit row at all — a privileged action with no trace, which is the single outcome
 * an audit log exists to prevent.
 *
 * A stale id is an ordinary mistake, not an exotic one: a helper acting for a user who has
 * since been deleted hits it. So the write degrades to an unattributed row that SAYS it could
 * not be attributed, rather than vanishing. Losing "who" is a much smaller loss than losing
 * "what happened".
 */
describe("audit(): an unresolvable actor degrades, it does not vanish", () => {
  const BOGUS = "user_that_does_not_exist_fk_violation";

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { action: { startsWith: "test.actor" } } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { action: { startsWith: "test.actor" } } });
  });

  it("still writes a row when userId violates the foreign key", async () => {
    await audit("test.actor.fk", { userId: BOGUS, detail: "removed all grants" });
    const row = await prisma.auditLog.findFirst({ where: { action: "test.actor.fk" } });
    expect(row, "the event vanished — this is the bug").not.toBeNull();
  });

  it("records that attribution failed, rather than pretending nobody was involved", async () => {
    await audit("test.actor.note", { userId: BOGUS, detail: "created grant Plex-restart" });
    const row = await prisma.auditLog.findFirst({ where: { action: "test.actor.note" } });
    expect(row?.userId).toBeNull();
    // The original detail survives — losing what happened would defeat the point of the rescue.
    expect(row?.detail).toContain("created grant Plex-restart");
    expect(row?.detail).toContain("could not be attributed");
    expect(row?.detail).toContain(BOGUS); // the id itself, so it can be chased down
  });

  it("auditOrThrow degrades the same way, so a stale id cannot block a privileged action", async () => {
    // Without this, fail-closed auditing would turn an ordinary mistake into a broken feature:
    // createGrant refuses when the attempt cannot be recorded, and a bad id would trip it.
    await expect(auditOrThrow("test.actor.strict", { userId: BOGUS })).resolves.toBeUndefined();
    const row = await prisma.auditLog.findFirst({ where: { action: "test.actor.strict" } });
    expect(row).not.toBeNull();
    expect(row?.userId).toBeNull();
  });

  it("keeps the actor when it does resolve", async () => {
    // The rescue must not fire on the happy path and quietly strip attribution from everything.
    const user = await prisma.user.findFirst();
    if (!user) return; // no seeded users in this DB; nothing to assert
    await audit("test.actor.ok", { userId: user.id });
    const row = await prisma.auditLog.findFirst({ where: { action: "test.actor.ok" } });
    expect(row?.userId).toBe(user.id);
    expect(row?.detail ?? "").not.toContain("could not be attributed");
  });
});
