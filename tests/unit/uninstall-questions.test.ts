import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { answersFor } from "@/lib/uninstall-questions";

/**
 * A module or helper can put a question on the uninstall confirmation screen — "also remove
 * Docker Desktop?", "withdraw the Windows permissions this holds?". `onUninstall` is headless
 * and runs after the admin has confirmed, so it is far too late to ask anything there.
 *
 * **A MODULE IS THIRD-PARTY CODE PUTTING TEXT ON A CORE ADMIN SCREEN.** That is the risk this
 * feature carries, and these tests are the constraints that make it acceptable.
 */
const SRC = fs.readFileSync(path.join(process.cwd(), "lib", "uninstall-questions.ts"), "utf8");
const UI = fs.readFileSync(
  path.join(process.cwd(), "app", "admin", "modules", "uninstall-questions.tsx"),
  "utf8",
);

describe("answers are namespaced, so nobody can read or forge another's", () => {
  const ticked = [
    "module:docker:removeDocker",
    "module:other:removeDocker",
    "helper:host-install:removeDocker",
  ];

  it("gives a module only its own answers", () => {
    expect(answersFor("module", "docker", ticked)).toEqual({ removeDocker: true });
  });

  it("does not leak a helper's answer to a module with the same id", () => {
    // Same question id in three places; each caller must see exactly one.
    expect(answersFor("helper", "host-install", ticked)).toEqual({ removeDocker: true });
    expect(answersFor("module", "nobody", ticked)).toEqual({});
  });

  it("an unticked question is absent rather than false", () => {
    // Documented as read-defensively: absent means "not asked" or "not ticked", and a caller
    // must not treat a missing key as a deliberate no.
    expect(answersFor("module", "docker", [])).toEqual({});
  });

  it("a forged prefix cannot reach another owner", () => {
    // The separator is part of the prefix, so "docker" cannot match "docker-evil".
    expect(answersFor("module", "docker", ["module:docker-evil:x"])).toEqual({});
  });
});

describe("the constraints on third-party questions", () => {
  it("forces a module's default to false, and honours a helper's", () => {
    // A third party does not get to pre-tick a box on a destructive-confirmation screen.
    // Helpers are first-party, so theirs stands.
    expect(SRC).toMatch(/default:\s*owner\.kind === "helper" \? Boolean\(q\.default\) : false/);
  });

  it("caps how many questions one source can ask", () => {
    // Otherwise a module could bury the confirm button under its own questions.
    expect(SRC).toMatch(/MAX_PER_SOURCE\s*=\s*10/);
    expect(SRC).toContain("slice(0, MAX_PER_SOURCE)");
  });

  it("bounds the call and swallows failure, so a module cannot block its own removal", () => {
    // A module that throws or hangs here would otherwise make itself unremovable.
    expect(SRC).toContain("BUDGET_MS");
    expect(SRC).toMatch(/catch\s*{[\s\S]*return \[\];/);
  });

  it("truncates label and detail", () => {
    expect(SRC).toMatch(/label:.*slice\(0, 200\)/);
    expect(SRC).toMatch(/detail.*slice\(0, 400\)/);
  });

  it("renders as TEXT — never markup", () => {
    // The whole point: third-party wording on a core screen must not be able to become HTML.
    // Matched as the JSX PROP, not the bare word — the comment above the render explains why it
    // must never be used, and a substring check trips on that explanation instead of on code.
    expect(UI).not.toMatch(/dangerouslySetInnerHTML\s*=/);
  });

  it("attributes every question to whoever asked it", () => {
    // Nobody should read a module's wording as JonDash speaking.
    expect(UI).toContain("Asked by");
    expect(UI).toContain("q.owner.name");
  });
});
