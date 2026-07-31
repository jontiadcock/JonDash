import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isServiceAccount, serviceAccountLabel, serviceAccountHandle } from "@/lib/auth/service-accounts";

/**
 * SEC-07 · Service accounts — an identity nobody can ever sign in as.
 *
 * **The guarantee is total or it is nothing.** A half-closed door here is worse than none, because
 * the screen says "cannot log in" and an admin believes it. These tests exist to make each way in
 * fail loudly if it is ever reopened by someone who never heard of this feature.
 *
 * The load-bearing one is the admin count. `hasActiveAdmin()` gates the first-run recovery wizard,
 * so if a service account could satisfy it, an install whose last human admin was deleted would
 * show the login page forever — with nobody able to sign in, and the wizard that exists to rescue
 * exactly that situation permanently suppressed by an account that cannot itself be used.
 * REFS app/login/actions.ts · app/admin/actions.ts · app/setup/[token]/actions.ts
 *      lib/auth/bootstrap.ts · lib/auth/service-accounts.ts · lib/auth/permissions.ts — and 2 more
 */

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const LOGIN = read("app/login/actions.ts");
const ADMIN = read("app/admin/actions.ts");
const SETUP = read("app/setup/[token]/actions.ts");
const BOOTSTRAP = read("lib/auth/bootstrap.ts");
const SVC = read("lib/auth/service-accounts.ts");
const PERMS = read("lib/auth/permissions.ts");

describe("the one definition", () => {
  it("recognises a service account and nothing else", () => {
    expect(isServiceAccount({ isServiceAccount: true })).toBe(true);
    expect(isServiceAccount({ isServiceAccount: false })).toBe(false);
    expect(isServiceAccount(null)).toBe(false);
    expect(isServiceAccount(undefined)).toBe(false);
  });

  it("generates a non-routable handle, unique per call", () => {
    // `.invalid` is reserved by RFC 2606 so it can never resolve — a service account has no
    // mailbox and must not look like it has one.
    const a = serviceAccountHandle();
    const b = serviceAccountHandle();
    expect(a).toMatch(/^svc-[0-9a-f-]{36}@service\.invalid$/);
    expect(a).not.toBe(b);
  });
});

describe("audit attribution", () => {
  it("names the service account, never a person", () => {
    // Half the reason this feature exists: the log used to read "jonti revoked session X" when
    // it was an agent.
    expect(
      serviceAccountLabel({ email: "svc-x@service.invalid", isServiceAccount: true, displayName: "AI assistant" }),
    ).toBe("AI assistant (service account)");
  });

  it("leaves a person as their email", () => {
    expect(serviceAccountLabel({ email: "someone@example.com", isServiceAccount: false })).toBe(
      "someone@example.com",
    );
  });

  it("stays identifiable if displayName is somehow missing", () => {
    // Not reachable through the create action, which requires a name. The fallback exists so a row
    // written by some future path is still attributable rather than blank in an audit column.
    const label = serviceAccountLabel({ email: "svc-y@service.invalid", isServiceAccount: true, displayName: null });
    expect(label).toContain("service account");
    expect(label).toContain("svc-y@service.invalid");
  });
});

describe("THE LOCKOUT GUARD — a service account must never satisfy 'an admin exists'", () => {
  it("counts humans only", () => {
    /*
     * If this filter goes, deleting the last human admin leaves an install that shows the login
     * page forever and cannot be recovered, because the wizard is gated on this count and the
     * account keeping it quiet cannot be signed into.
     */
    expect(SVC).toMatch(/countHumanAdmins[\s\S]*?isServiceAccount:\s*false/);
  });

  it("hasActiveAdmin delegates rather than running its own count", () => {
    // One definition of "human". A second `role: ADMIN` count copied into a future guard is how
    // this regresses, so bootstrap must not contain one.
    expect(BOOTSTRAP).toContain("countHumanAdmins()");
    expect(BOOTSTRAP).not.toMatch(/count\(\{\s*where:\s*\{\s*role:\s*"ADMIN"/);
  });

  it("the pending-admin lookup excludes them too", () => {
    expect(BOOTSTRAP).toMatch(/getPendingAdmin[\s\S]*?isServiceAccount:\s*false/);
  });
});

describe("every way in is closed", () => {
  it("sign-in refuses BEFORE any credential comparison", () => {
    /*
     * Order is the control: refused in the same branch as an unknown address, which spends the
     * decoy hash. So it answers in the same time with the same words and cannot be probed for
     * existence. A check after verifyPassword would leak both.
     */
    const guard = LOGIN.indexOf("isServiceAccount(user)");
    const verify = LOGIN.indexOf("await verifyPassword(");
    expect(guard).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(guard);
  });

  it("does not rely on passwordHash being null", () => {
    // A null hash is an absence, and an absence can be filled in by a path that never heard of
    // service accounts. The flag is a statement.
    expect(LOGIN).toMatch(/isServiceAccount\(user\)\s*\|\|\s*!user\.passwordHash/);
  });

  it("a setup token can never be completed by one", () => {
    expect(SETUP).toContain("if (isServiceAccount(user)) return null;");
  });

  it("admin reset refuses — it is the sharpest promotion path in the app", () => {
    /*
     * resetAccessAction sets PENDING_SETUP and mints a working setup link, i.e. exactly how an
     * identity acquires a password and MFA. Unguarded, it converts a service account into a login
     * and hands someone the URL to finish the job.
     */
    const guard = ADMIN.indexOf("A service account has no sign-in to reset");
    const mint = ADMIN.indexOf("const token = await newSetupToken();", ADMIN.indexOf("resetAccessAction"));
    expect(guard).toBeGreaterThan(-1);
    expect(mint).toBeGreaterThan(guard);
  });

  it("creating one never writes a credential field", () => {
    const start = ADMIN.indexOf("createServiceAccountAction");
    const body = ADMIN.slice(start, ADMIN.indexOf("export async function", start + 1));
    for (const field of ["passwordHash", "setupTokenHash", "setupTokenExpiresAt", "totpSecretEnc", "mfaEnabled"]) {
      expect(body, `create must not write ${field}`).not.toContain(field);
    }
  });
});

describe("disable and re-enable actually work", () => {
  it("re-enabling does not require a password and MFA it can never have", () => {
    /*
     * The completed-setup test is one a service account can never pass, so without the exception
     * the Enable button would silently do nothing — the worst kind of broken, because the UI
     * reports success.
     */
    expect(ADMIN).toMatch(/isServiceAccount\(user\)\s*\|\|\s*\(user\.passwordHash && user\.totpSecretEnc\)/);
  });
});

describe("the helper-facing surface", () => {
  it("lists service accounts ONLY — a person can never appear", () => {
    /*
     * Stronger than filtering at the helper's end: there is nothing to filter, and no way to bind
     * to a person even by mistake. The list is also the predicate, so no separate isBindable()
     * can ever disagree with what the picker shows.
     */
    expect(SVC).toMatch(/listBindableAccounts[\s\S]*?where:\s*\{\s*isServiceAccount:\s*true\s*\}/);
    expect(SVC).toMatch(/resolveBindableAccount[\s\S]*?isServiceAccount:\s*true/);
  });

  it("exposes exactly four fields and no more", () => {
    const start = SVC.indexOf("export type BindableAccount");
    const body = SVC.slice(start, SVC.indexOf("};", start));
    const fields = [...body.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(fields.sort()).toEqual(["displayName", "id", "role", "status"]);
  });

  it("never exposes a credential field to a helper", () => {
    const start = SVC.indexOf("export type BindableAccount");
    const body = SVC.slice(start);
    for (const field of ["passwordHash", "totpSecretEnc", "setupTokenHash", "backupCodes"]) {
      expect(body, `helpers must not see ${field}`).not.toContain(field);
    }
  });
});

describe("permissions outside a request", () => {
  it("exports an uncached sibling, with cache() as a thin wrapper over it", () => {
    /*
     * Owner decision 2026-07-26. Measured: cache() outside a render neither throws nor memoizes,
     * so calling it would work today — but that is undocumented React internal behaviour, and if
     * it changed, authorization would break or leak SILENTLY. One body, two named entry points.
     */
    expect(PERMS).toContain("export async function getEffectivePermissionsUncached");
    expect(PERMS).toContain("export const getEffectivePermissions = cache(getEffectivePermissionsUncached)");
  });
});

describe("the deletion hook is hygiene, never safety", () => {
  it("fires after the row is gone, and cannot block the delete", () => {
    const BOOT = read("lib/helpers/boot.ts");
    expect(BOOT).toContain("notifyIdentityRemoved");
    // Bounded and isolated per helper, exactly like onBoot — a helper that hangs must not hold up
    // an admin action on the identity page.
    expect(BOOT).toMatch(/notifyIdentityRemoved[\s\S]*?Promise\.race/);
    expect(BOOT).toMatch(/notifyIdentityRemoved[\s\S]*?catch/);
    // Deletion happens first; the notification is after, so a helper re-resolving during its own
    // cleanup sees the truth rather than a row about to vanish.
    const del = ADMIN.indexOf("prisma.user.delete(");
    expect(ADMIN.indexOf("notifyIdentityRemoved(user.id)")).toBeGreaterThan(del);
  });
});

/**
 * Helper lifecycle: an off switch that doesn't stop anything is the defect this guards
 * (2026-07-27).
 *
 * For almost every helper it makes no difference — a helper does nothing until a module calls it.
 * It matters entirely for a helper that holds a resource of its own, and the `mcp` helper (a
 * listening socket) was the first. Reported by the add-ons session after switching their add-on off
 * left the endpoint open.
 */
describe("a helper starts only when an enabled module needs it", () => {
  const BOOT = read("lib/helpers/boot.ts");
  const REG = read("lib/helpers/registry.ts");

  it("gates onBoot on the ACTIVE set, not the installed set", () => {
    expect(BOOT).toMatch(/if \(def\.onBoot && active\.has\(def\.id\)\)/);
    expect(BOOT).toContain("await activeHelperIds()");
  });

  it("still migrates every INSTALLED helper, enabled or not", () => {
    /*
     * The trap in the obvious version of this fix. Skipping migrations for a dormant helper leaves
     * it meeting an old layout the moment someone re-enables the module — the failure modules hit
     * before ensureModuleMigrations existed.
     */
    const start = BOOT.indexOf("export async function bootHelpers");
    const body = BOOT.slice(start, BOOT.indexOf("\nexport ", start + 1));
    const filter = body.indexOf("required.has(h.id)");
    const migrate = body.indexOf("await runHelperMigrations(def)");
    const gate = body.indexOf("active.has(def.id)");
    expect(filter).toBeGreaterThan(-1);
    expect(migrate).toBeGreaterThan(filter); // migration is inside the REQUIRED loop…
    expect(gate).toBeGreaterThan(migrate); // …and the enabled gate comes after it
  });

  it("counts enabled modules, so a dormant helper cannot be started by an installed-but-off one", () => {
    expect(REG).toMatch(/activeHelperIds[\s\S]*?getEnabledModules\(\)/);
  });
});
