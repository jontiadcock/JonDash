import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeSessionEpoch, sessionEpochFor } from "@/lib/boot";

// The session cutoff (lib/auth/session.ts rejects sessions created before it). It is REUSED
// across a graceful, app-initiated restart so everyone stays signed in, and advances (cutting
// every session off) only on an unexpected boot — a crash, a folder copied elsewhere, or a
// shutdown -> cold start. Two markers signal "graceful":
//   .data/post-update  — an UPDATE (also drives crash-revert; the launcher clears it).
//   .data/keep-sessions — an in-app restart / module rebuild.
// Neither is deleted by computeSessionEpoch: the server evaluates this module more than once
// per start (instrumentation bundle, then the first app-route request), so a delete-on-read
// would let the second evaluation advance past a fresh session. The SUPERVISOR clears them
// after a healthy boot; the tests simulate that with an explicit rm.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "jd-epoch-"));
const markUpdate = (d: string) => fs.writeFileSync(path.join(d, "post-update"), "1");
const markRestart = (d: string) => fs.writeFileSync(path.join(d, "keep-sessions"), "1");
const clearMarkers = (d: string) => { // what the supervisor does once the boot is healthy
  fs.rmSync(path.join(d, "post-update"), { force: true });
  fs.rmSync(path.join(d, "keep-sessions"), { force: true });
};

describe("session epoch", () => {
  it("advances to now on the first boot and on a plain restart", () => {
    const d = tmp();
    expect(computeSessionEpoch(d, 1000)).toBe(1000); // first boot
    // restart: no post-update marker -> advance, so sessions from the 1000 run are cut off
    expect(computeSessionEpoch(d, 2000)).toBe(2000);
  });

  it("reuses the previous epoch across a post-update boot (keeps sessions)", () => {
    const d = tmp();
    computeSessionEpoch(d, 1000); // run that created the sessions
    markUpdate(d); // an update is applied
    // post-update boot reuses 1000, so sessions created after 1000 survive
    expect(computeSessionEpoch(d, 5000)).toBe(1000);
  });

  it("advances again on the next plain restart after an update", () => {
    const d = tmp();
    computeSessionEpoch(d, 1000);
    markUpdate(d);
    computeSessionEpoch(d, 5000); // post-update -> reuse 1000
    clearMarkers(d); // marker cleared once the new build is healthy
    expect(computeSessionEpoch(d, 9000)).toBe(9000); // ordinary restart cuts off again
  });

  it("advances (does not keep) when there is no previous epoch, even with the marker", () => {
    const d = tmp();
    markUpdate(d); // marker but no prior epoch file — must fall back to now, the safe way
    expect(computeSessionEpoch(d, 3000)).toBe(3000);
  });

  // keep-sessions marker: in-app restart + module rebuild (the new behaviour).
  it("reuses the previous epoch across an in-app restart (keep-sessions), keeping sessions", () => {
    const d = tmp();
    computeSessionEpoch(d, 1000);
    markRestart(d);
    expect(computeSessionEpoch(d, 5000)).toBe(1000); // graceful restart -> sessions survive
  });

  // Regression for the double-evaluation bug found in live testing: the server computes the
  // epoch more than once per start (instrumentation bundle + first app-route request). BOTH
  // must reuse — a delete-on-read let the second advance past a just-created session.
  it("reuses across MULTIPLE evaluations of one start (marker not consumed on read)", () => {
    const d = tmp();
    computeSessionEpoch(d, 1000);
    markRestart(d);
    expect(computeSessionEpoch(d, 5000)).toBe(1000); // evaluation #1 (e.g. instrumentation)
    expect(computeSessionEpoch(d, 5300)).toBe(1000); // evaluation #2 (first request) — still reuses
    expect(fs.existsSync(path.join(d, "keep-sessions"))).toBe(true); // left for the supervisor
  });

  it("advances on the next plain restart once the supervisor has cleared keep-sessions", () => {
    const d = tmp();
    computeSessionEpoch(d, 1000);
    markRestart(d);
    computeSessionEpoch(d, 5000); // reuse 1000
    clearMarkers(d); // supervisor clears it after a healthy boot
    expect(computeSessionEpoch(d, 9000)).toBe(9000); // an ordinary restart now cuts off
  });

  // Regression, found in the field: applying an update signed everyone out a moment later.
  // `lib/boot` is imported by several route bundles and Next loads those LAZILY, on first
  // request — so the reuse-or-advance decision was re-taken whenever a bundle happened to
  // load, including after the supervisor had cleared the marker. That late evaluation saw no
  // marker, advanced the epoch past every freshly-created session, and logged the instance
  // out. The decision must be made once per RUN, and later callers must agree with it.
  it("is decided once per run: a later caller agrees even after the marker is gone", () => {
    const d = tmp();
    computeSessionEpoch(d, 1000); // the run that created the sessions
    markRestart(d);

    const first = sessionEpochFor(d); // whichever bundle loads first decides
    expect(first).toBe(1000); // graceful restart -> reuse

    clearMarkers(d); // the supervisor clears it once the boot looks healthy

    // A route bundle loading minutes later must NOT re-decide and advance.
    expect(sessionEpochFor(d)).toBe(first);
    expect(sessionEpochFor(d)).toBe(first);
  });

  it("shutdown -> cold start (no marker) signs everyone out", () => {
    const d = tmp();
    computeSessionEpoch(d, 1000); // a session-bearing run
    // shutdown leaves NO marker (and clears any leftover); the next cold start advances
    expect(computeSessionEpoch(d, 8000)).toBe(8000);
  });
});
