import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A new service tile has to appear on the dashboard (1.8.0-beta.11).
 *
 * Owner: *"I just added a personal service and cannot see the new tile on my dashboard."* The
 * tile was created correctly every time. `/dashboard` is a cached route, and while editing and
 * deleting a link both revalidated it, **creating one never did** — so the one case where you
 * are certainly looking for a change was the one case that showed none until something else
 * happened to invalidate the route.
 *
 * **Source-level on purpose.** The defect is a missing call. Nothing observable differs inside
 * the action — it returns `{ok: true}` either way — and Next's cache is not something a unit
 * test can inspect, so the assertion has to be that the call is present. Same reasoning as
 * dashboard-paint.test.ts: when the failure is an omission, assert against the source.
 * REFS app/admin/actions.ts — read as text
 */
const SRC = fs
  .readFileSync(path.join(process.cwd(), "app", "admin", "actions.ts"), "utf8")
  // A regex over source is a regex over comments too (BUG-39). The comments here name the very
  // functions being asserted about, so they must go before anything is matched.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** The body of one exported action, from its signature to the next top-level declaration. */
function actionBody(name: string): string {
  const start = SRC.indexOf(`export async function ${name}(`);
  expect(start, `${name} not found in app/admin/actions.ts`).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 1);
  const end = rest.search(/\nexport (async )?function |\nfunction /);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Every action that changes what tiles exist, or what order they are in. */
const TILE_ACTIONS = [
  "createLinkAction",
  "updateLinkAction",
  "deleteLinkAction",
  "createRoleLinkAction",
];

describe("every action that changes a tile revalidates the dashboard", () => {
  for (const name of TILE_ACTIONS) {
    it(`${name} revalidates the owner's dashboard`, () => {
      const body = actionBody(name);
      expect(body, `${name} writes a tile without revalidating /dashboard`).toMatch(
        /revalidateLinkOwner\(/,
      );
    });
  }

  /**
   * The helper is the only place the dashboard path is written, so a new action gets the
   * behaviour by copying one line rather than by remembering three.
   */
  it("routes every dashboard revalidation through the one helper", () => {
    const helper = SRC.match(/function revalidateLinkOwner\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(helper, "revalidateLinkOwner not found").toContain("revalidatePath");
    expect(helper, "the helper does not revalidate /dashboard").toMatch(
      /revalidatePath\("\/dashboard"\)/,
    );

    // Anywhere else naming /dashboard directly is a second source of truth waiting to drift.
    const direct = SRC.match(/revalidatePath\("\/dashboard"\)/g) ?? [];
    expect(direct.length, "/dashboard is revalidated outside the helper").toBe(1);
  });
});
