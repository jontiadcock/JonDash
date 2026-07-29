"use client";

import { useState } from "react";
import type { ModuleScreenshot } from "@/lib/modules/sources";

/**
 * A module's screenshots, in a horizontal strip (8.2).
 *
 * **Across, never down.** Stacking four pictures vertically pushes the permissions — the thing the
 * page exists for — below the fold, so a decision that should be made after reading what a module
 * can do gets made after looking at pictures of it. A strip keeps them glanceable and keeps the
 * consent text on screen.
 *
 * Each has its own loading and failed state, because they arrive independently over a proxy that
 * talks to GitHub: one slow or missing picture must not leave a row of empty boxes with no
 * explanation. **A screenshot that fails is removed rather than shown broken** — it is decoration,
 * and a broken-image icon beside a list of permissions reads as something being wrong with the
 * module.
 */
export function Screenshots({
  moduleId,
  channel,
  shots,
}: {
  moduleId: string;
  channel: string;
  shots: ModuleScreenshot[];
}) {
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState<Set<number>>(new Set());

  const visible = shots.map((s, i) => ({ ...s, i })).filter((s) => !failed.has(s.i));
  if (visible.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">Screenshots</h2>
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        // Wide content scrolls inside its own container rather than making the page scroll
        // sideways — the same rule the rest of the app follows.
        style={{ scrollbarWidth: "thin" }}
      >
        {visible.map((shot) => (
          <figure key={shot.i} className="m-0 flex-none" style={{ width: "min(20rem, 78vw)" }}>
            <div
              className="relative overflow-hidden rounded-lg"
              style={{
                // 16:10, the agreed ratio — reserved before the image arrives so the strip doesn't
                // jump as each one loads.
                aspectRatio: "16 / 10",
                background: "var(--surface-2)",
              }}
            >
              {!loaded.has(shot.i) && (
                <span
                  className="absolute inset-0 flex items-center justify-center text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  Loading…
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element -- a remote image proxied by
                  our own route; next/image would add a second resizing layer over bytes we have
                  already size-capped, for no benefit. */}
              <img
                src={`/api/modules/screenshot?id=${encodeURIComponent(moduleId)}&channel=${encodeURIComponent(channel)}&i=${shot.i}`}
                alt={shot.caption ?? `Screenshot ${shot.i + 1}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                style={{ opacity: loaded.has(shot.i) ? 1 : 0 }}
                onLoad={() => setLoaded((s) => new Set(s).add(shot.i))}
                onError={() => setFailed((s) => new Set(s).add(shot.i))}
              />
            </div>
            {shot.caption && (
              <figcaption className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {shot.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
