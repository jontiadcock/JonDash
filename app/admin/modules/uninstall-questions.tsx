"use client";

import { useEffect, useState } from "react";
import { uninstallQuestionsAction } from "./actions";
import type { AttributedQuestion } from "@/lib/uninstall-questions";

/**
 * Extra questions a module or helper wants answered before it is removed.
 *
 * `onUninstall` is headless and runs after the admin has already confirmed, so anything needing
 * a decision — "also remove Docker Desktop?", "withdraw the Windows permissions this holds?" —
 * has nowhere to be asked. Doing either automatically is wrong (it is the admin's machine) and
 * doing neither silently is also wrong. This is the only moment a person is present.
 *
 * **Attribution is a safety feature, not decoration.** A module is third-party code putting
 * text on a core admin screen, so every question names who asked it. Nobody should read a
 * module's wording as JonDash speaking. Core also forces a module's boxes unticked — see
 * `lib/uninstall-questions.ts`, where that and the other limits are enforced.
 */
export function UninstallQuestions({ moduleIds }: { moduleIds: string[] }) {
  const [questions, setQuestions] = useState<AttributedQuestion[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    uninstallQuestionsAction(moduleIds)
      .then((qs) => {
        if (!live) return;
        setQuestions(qs);
        // Pre-tick only what came back already ticked. Core has already forced modules to
        // false, so anything defaulting true here is first-party.
        setTicked(new Set(qs.filter((q) => q.question.default).map((q) => q.key)));
      })
      // A failure here must never block the uninstall: show it without questions rather than
      // leaving somebody unable to remove a module because the module misbehaved.
      .catch(() => live && setQuestions([]));
    return () => {
      live = false;
    };
  }, [moduleIds]);

  if (questions === null || questions.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <p className="text-sm font-semibold">Before removing, decide these:</p>
      {questions.map((q) => (
        <label key={q.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
          {/* The value carries the namespaced key, so an answer can only ever be read by the
              module or helper that asked for it. */}
          <input
            type="checkbox"
            name="answer"
            value={q.key}
            checked={ticked.has(q.key)}
            onChange={(e) => {
              const next = new Set(ticked);
              if (e.target.checked) next.add(q.key);
              else next.delete(q.key);
              setTicked(next);
            }}
            className="mt-0.5 flex-none"
          />
          <span className="flex flex-col gap-0.5">
            {/* Rendered as text by React. Never dangerouslySetInnerHTML here — this is
                third-party wording on a destructive-confirmation screen. */}
            <span>{q.question.label}</span>
            {q.question.detail && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {q.question.detail}
              </span>
            )}
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Asked by {q.owner.name}
              {q.owner.kind === "helper" ? " (shared capability)" : ""}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
