import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { collectClassTokens, renderTailwindClasses } from "@/scripts/gen-module-registry.mjs";

/**
 * Which Tailwind classes survive the trip from a module's source into the file Tailwind scans.
 *
 * **This had no test, and that is why it was wrong for months.** An installed module's folder is
 * gitignored and invisible to Tailwind, so its classes are mirrored into a generated HTML file. A
 * class that fails to make that trip **fails silently and completely**: it stays on the element,
 * nothing defines it, and typecheck, lint, `next build` and the module verifier all pass while the
 * widget renders wrong. There is no error to notice.
 *
 * Reported by the add-ons session (2026-07-29) after losing time to `text-[clamp(…)]` producing no
 * CSS — and core's own 1.8.0 sizing guidance recommends exactly that shape.
 */
function tokensFrom(source: string): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jondash-classes-"));
  try {
    fs.writeFileSync(path.join(dir, "widget.tsx"), source, "utf8");
    return collectClassTokens([dir]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("mirroring a module's Tailwind classes", () => {
  /**
   * Every one of these was dropped before 2026-07-29, because the extractor rejected any token
   * containing a parenthesis, an angle bracket or an apostrophe.
   */
  it.each([
    ["a CSS function in an arbitrary value", 'className="text-[clamp(1rem,22cqw,2.25rem)]"'],
    ["calc()", 'className="w-[calc(100%-2rem)]"'],
    ["nested functions", 'className="grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]"'],
    ["v4's CSS-variable shorthand", 'className="bg-(--brand)"'],
    ["a child combinator", 'className="[&>span]:underline"'],
    ["a quoted content value", "className=\"content-['x']\""],
  ])("keeps %s", (_label, source) => {
    const tokens = tokensFrom(source);
    const cls = source.match(/"([^"]*)"/)![1]!;
    expect(tokens).toContain(cls);
  });

  it("still keeps the ordinary cases", () => {
    const tokens = tokensFrom('className="@[6rem]:block w-[46%] min-w-7 flex-1"');
    expect(tokens).toEqual(expect.arrayContaining(["@[6rem]:block", "w-[46%]", "min-w-7", "flex-1"]));
  });

  /**
   * A token from a template expression is dynamic — it can never be a static class, so collecting
   * it is pointless. Not a correctness issue either way (over-collecting is harmless), but there is
   * no reason to carry the noise.
   */
  it("drops template-expression fragments", () => {
    const tokens = tokensFrom("className={`text-${size} p-2`}");
    expect(tokens.some((t) => t.includes("${"))).toBe(false);
    expect(tokens).toContain("p-2");
  });

  /**
   * The one character that genuinely cannot survive: the tokens are emitted into a `class="…"`
   * attribute, and a double quote would end it early — silently truncating every class after it.
   */
  it("never emits a token that would break the class attribute", () => {
    const rendered = renderTailwindClasses(["safe-1", 'has"quote', "safe-2"]);
    const attr = rendered.match(/class="([^"]*)"/)![1]!;
    expect(attr).toContain("safe-1");
    expect(attr).toContain("safe-2");
    // Whatever the extractor lets through, the renderer's attribute must stay well-formed.
    expect(rendered.match(/class="/g)).toHaveLength(1);
  });
});
