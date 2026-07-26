"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getModuleDef } from "@/lib/modules/registry";
import { getHelperDef } from "@/lib/helpers/registry";
import { nextGrants, parseGrants } from "@/lib/modules/permissions";
import type { DeclaredPermission } from "@/lib/modules/types";
import type { HelperSettingsResult, ScopeItem, ScopeCandidate } from "@/lib/helpers/types";

async function gate() {
  await assertSameOrigin();
  return requirePermission("modules.manage");
}

/**
 * Turn one capability on or off for one module (CORE-10).
 *
 * **Per (module, capability), never per helper.** A helper-level switch would silently widen
 * every module that declared that helper, including ones installed earlier for unrelated
 * reasons.
 *
 * Enforcement needs nothing else: `ctx.can()` reads the stored list, so the next context built
 * for that module reflects this. The declared set remains the ceiling — `nextGrants` refuses a
 * permission the module never declared, so a tampered form cannot widen a module past what its
 * consent screen showed.
 */
export async function setModuleGrantAction(
  moduleId: string,
  permission: string,
  granted: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await gate();

  const def = getModuleDef(String(moduleId));
  if (!def) return { ok: false, error: "That module isn't installed." };

  const row = await prisma.module.findUnique({ where: { id: def.id } });
  if (!row) return { ok: false, error: "That module isn't set up yet — enable it first." };

  const next = nextGrants(def, parseGrants(row.grantedPermissions), permission as DeclaredPermission, granted);
  if (next === null) {
    return { ok: false, error: `${def.name} never asked for "${permission}", so it can't be given it.` };
  }

  await prisma.module.update({
    where: { id: def.id },
    data: { grantedPermissions: JSON.stringify(next) },
  });

  // Recorded either way. Removing a capability is as worth knowing about as adding one —
  // more so, when something later stops working and nobody remembers why.
  await audit("admin.module.permission", {
    userId: admin.id,
    detail: `${def.id}: ${granted ? "granted" : "revoked"} ${permission}`,
  });

  revalidatePath("/admin/permissions");
  revalidatePath("/admin/modules");
  return { ok: true };
}

/**
 * Read the admin-owned set that bounds a capability.
 *
 * No audit entry and no elevation: this is a read, and a prompt merely to answer "what is on the
 * list?" would train click-through.
 */
export async function listScopeAction(
  helperId: string,
  permission: string,
): Promise<
  | { ok: true; items: ScopeItem[]; itemToggle: { label: string; warning?: string } | null }
  | { ok: false; error: string }
> {
  await gate();
  const scope = findScope(helperId, permission);
  if (!scope) return { ok: false, error: "That capability has no editable list." };
  try {
    // The per-item switch's wording travels with the list it labels. Only the declaration
    // crosses to the client — never `set`, which is reachable solely through the gated action.
    const t = scope.itemToggle;
    return {
      ok: true,
      items: await scope.list(),
      itemToggle: t ? { label: t.label, warning: t.warning } : null,
    };
  } catch (e) {
    // A helper that throws must not blank the page — the switches still matter.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Add to or remove from that set.
 *
 * **Core owns this channel**, exactly as it owns `saveHelperSettingsAction`, and for the reason
 * this whole area exists: `host-services` once exposed its own editor to modules, and a module
 * could display "Add Plex" while submitting "sshd". The check that must be remembered is the one
 * that gets forgotten, so it happens here — before the helper is reached — every time.
 *
 * `ctx.user` is built from the resolved session, never from anything a caller supplied.
 */
export async function editScopeAction(
  helperId: string,
  permission: string,
  op: "add" | "remove",
  value: string,
): Promise<HelperSettingsResult> {
  const admin = await gate();

  const def = getHelperDef(String(helperId));
  const scope = findScope(helperId, permission);
  if (!def || !scope) return { ok: false, error: "That capability has no editable list." };

  const ctx = { helperId: def.id, user: { id: admin.id, email: admin.email, role: admin.role } };

  let result: HelperSettingsResult;
  try {
    result = op === "add" ? await scope.add(ctx, String(value)) : await scope.remove(ctx, String(value));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await audit("admin.helper.scope.error", { userId: admin.id, detail: `${def.id} ${permission}: ${message}` });
    return { ok: false, error: `${def.name} could not apply that: ${message}` };
  }

  // The VALUE is recorded, not a label. The bug this area exists to prevent was a friendly name
  // standing in for something else, so the log keeps what was actually acted on.
  await audit("admin.helper.scope", {
    userId: admin.id,
    detail: `${def.id} ${permission}: ${op} "${value}" → ${result.ok ? "applied" : `refused: ${result.error}`}`,
  });

  revalidatePath("/admin/permissions");
  return result;
}

/**
 * Candidates for the picker. A read: no elevation, no audit entry, no prompt.
 *
 * Exists so nobody has to type a service name correctly to bound a capability. If they did,
 * the one-click "everything" switch would win on effort alone.
 */
export async function browseScopeAction(
  helperId: string,
  permission: string,
  query: string,
): Promise<{ ok: true; candidates: ScopeCandidate[] } | { ok: false; error: string }> {
  await gate();
  const scope = findScope(helperId, permission);
  if (!scope?.browse) return { ok: false, error: "This one has nothing to browse." };
  try {
    return { ok: true, candidates: await scope.browse(String(query ?? "")) };
  } catch (e) {
    // Falling back to the manual field is fine; an error page is not.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Flip the per-item switch on one member of the list.
 *
 * Same gate and same channel as `editScopeAction`, for the same reason: this decides whether a
 * module may act on that item **without the prompt that currently gates it**, which is at least
 * as consequential as membership. It goes through core or it doesn't happen.
 */
export async function setItemToggleAction(
  helperId: string,
  permission: string,
  id: string,
  on: boolean,
): Promise<HelperSettingsResult> {
  const admin = await gate();

  const def = getHelperDef(String(helperId));
  const scope = findScope(helperId, permission);
  if (!def || !scope?.itemToggle) return { ok: false, error: "That capability has no per-item switch." };

  const ctx = { helperId: def.id, user: { id: admin.id, email: admin.email, role: admin.role } };

  let result: HelperSettingsResult;
  try {
    result = await scope.itemToggle.set(ctx, String(id), Boolean(on));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await audit("admin.helper.scope.error", { userId: admin.id, detail: `${def.id} ${permission}: ${message}` });
    return { ok: false, error: `${def.name} could not apply that: ${message}` };
  }

  await audit("admin.helper.scope.toggle", {
    userId: admin.id,
    detail: `${def.id} ${permission}: "${id}" ${on ? "ON" : "OFF"} (${scope.itemToggle.label}) → ${
      result.ok ? "applied" : `refused: ${result.error}`
    }`,
  });

  revalidatePath("/admin/permissions");
  return result;
}

/** Whether the capability is currently granted with no list at all. Read; no prompt. */
export async function unboundedStateAction(
  helperId: string,
  permission: string,
): Promise<{ ok: true; on: boolean; warning: string } | { ok: false; error: string }> {
  await gate();
  const scope = findScope(helperId, permission);
  if (!scope?.unbounded) return { ok: false, error: "This capability is always limited to a list." };
  try {
    return { ok: true, on: await scope.unbounded.isOn(), warning: scope.unbounded.warning };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Grant or withdraw the capability with **no list at all** — every service, every path.
 *
 * The most consequential thing on this page, so it is audited as its own action rather than
 * folded in with ordinary list edits: when someone later asks "when did this get access to
 * everything", the answer should be one search away.
 */
export async function setUnboundedAction(
  helperId: string,
  permission: string,
  on: boolean,
): Promise<HelperSettingsResult> {
  const admin = await gate();
  const def = getHelperDef(String(helperId));
  const scope = findScope(helperId, permission);
  if (!def || !scope?.unbounded) return { ok: false, error: "This capability is always limited to a list." };

  const ctx = { helperId: def.id, user: { id: admin.id, email: admin.email, role: admin.role } };
  let result: HelperSettingsResult;
  try {
    result = await scope.unbounded.set(ctx, Boolean(on));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await audit("admin.helper.unbounded.error", { userId: admin.id, detail: `${def.id} ${permission}: ${message}` });
    return { ok: false, error: `${def.name} could not apply that: ${message}` };
  }

  await audit("admin.helper.unbounded", {
    userId: admin.id,
    detail: `${def.id} ${permission}: ${on ? "GRANTED UNLIMITED" : "limited back to the list"} → ${
      result.ok ? "applied" : `refused: ${result.error}`
    }`,
  });
  revalidatePath("/admin/permissions");
  return result;
}

function findScope(helperId: string, permission: string) {
  return getHelperDef(String(helperId))?.provides?.find((c) => c.permission === permission)?.scope;
}
