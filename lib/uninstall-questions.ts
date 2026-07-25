import "server-only";
import { getAllModules, getModuleDef } from "@/lib/modules/registry";
import { getHelperDef } from "@/lib/helpers/registry";
import { helperIdsOf } from "@/lib/modules/types";
import { helpersThatWouldBePruned } from "@/lib/helpers/install";
import type { UninstallQuestion } from "@/lib/modules/types";

/**
 * Questions shown on the uninstall confirmation screen, gathered from the modules being
 * removed and from any helper that removal would prune.
 *
 * **Why this exists.** `onUninstall` is headless and runs after the admin has already
 * confirmed, so a module or helper could clean up silently and nothing more. Two real cases
 * need to *ask*: whether to withdraw the Windows permissions a helper holds, and whether to
 * remove software JonDash installed. Doing either automatically is wrong — it is the admin's
 * machine — and doing neither silently is also wrong. The only moment to ask is while they are
 * on the screen, which is here.
 *
 * **This module is where the constraints are enforced**, not the callers, so a new caller
 * cannot forget them.
 */

/** A question plus who asked it. Attribution is a safety property, not decoration. */
export type AttributedQuestion = {
  /** `module:<id>` or `helper:<id>` — namespaced, so two sources can share a question id. */
  key: string;
  owner: { kind: "module" | "helper"; id: string; name: string };
  question: UninstallQuestion;
};

/** No source may make the confirmation screen unusable. */
const MAX_PER_SOURCE = 10;

/** Long enough for a real lookup, short enough that a confirmation screen still appears. */
const BUDGET_MS = 3000;

async function ask(
  produce: () => Promise<UninstallQuestion[]>,
  owner: AttributedQuestion["owner"],
): Promise<AttributedQuestion[]> {
  let raw: UninstallQuestion[];
  try {
    raw = await Promise.race([
      produce(),
      new Promise<UninstallQuestion[]>((_, reject) => setTimeout(() => reject(new Error("timed out")), BUDGET_MS)),
    ]);
  } catch {
    // Best-effort, like `readConfig`: showing the uninstall WITHOUT questions is far better
    // than not showing it at all. A broken module must not be able to block its own removal —
    // that would be a way to make itself unremovable.
    return [];
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((q) => q && typeof q.id === "string" && q.id.length > 0 && typeof q.label === "string" && q.label.length > 0)
    .slice(0, MAX_PER_SOURCE)
    .map((q) => ({
      key: `${owner.kind}:${owner.id}:${q.id}`,
      owner,
      question: {
        id: q.id,
        // Rendered as text by React; never interpolated as markup. Trimmed and bounded so a
        // long string cannot push the confirm button off the screen.
        label: String(q.label).slice(0, 200),
        detail: q.detail ? String(q.detail).slice(0, 400) : undefined,
        // A MODULE IS THIRD-PARTY CODE. It does not get to pre-tick a box on a screen whose
        // whole job is confirming a destructive act. Helpers are first-party, so theirs stands.
        default: owner.kind === "helper" ? Boolean(q.default) : false,
      },
    }));
}

/**
 * Everything to ask before uninstalling `moduleIds`.
 *
 * Helper questions are included only for helpers that this removal would actually prune —
 * asking about a helper that is staying would be a question with no consequence.
 */
export async function collectUninstallQuestions(moduleIds: string[]): Promise<AttributedQuestion[]> {
  const out: AttributedQuestion[] = [];

  for (const id of moduleIds) {
    const def = getModuleDef(id);
    if (!def?.uninstallQuestions) continue;
    out.push(...(await ask(def.uninstallQuestions, { kind: "module", id, name: def.name })));
  }

  for (const id of helpersThatWouldBePruned(moduleIds)) {
    const def = getHelperDef(id);
    if (!def?.uninstallQuestions) continue;
    out.push(...(await ask(def.uninstallQuestions, { kind: "helper", id, name: def.name })));
  }

  return out;
}

/**
 * Turn the ticked boxes back into `{ questionId: boolean }` for one source.
 *
 * Keyed by the namespaced form value, so a module cannot read — or forge — an answer belonging
 * to another module or to a helper.
 */
export function answersFor(kind: "module" | "helper", id: string, ticked: string[]): Record<string, boolean> {
  const prefix = `${kind}:${id}:`;
  const answers: Record<string, boolean> = {};
  for (const key of ticked) {
    if (key.startsWith(prefix)) answers[key.slice(prefix.length)] = true;
  }
  return answers;
}

/** Re-exported so callers don't reach into the helper installer for one function. */
export { helperIdsOf, getAllModules };
