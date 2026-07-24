import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeSessionEpoch } from "@/lib/boot";

// The session cutoff (lib/auth/session.ts rejects sessions created before it). It must
// advance on a plain restart (and a folder copied elsewhere) so those sign everyone out,
// but be REUSED across an in-place update so an update keeps everyone signed in. The update
// is signalled by the launcher's `.data/post-update` marker.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "jd-epoch-"));
const markUpdate = (d: string) => fs.writeFileSync(path.join(d, "post-update"), "1");

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
    fs.rmSync(path.join(d, "post-update")); // marker cleared once the new build is healthy
    expect(computeSessionEpoch(d, 9000)).toBe(9000); // ordinary restart cuts off again
  });

  it("advances (does not keep) when there is no previous epoch, even with the marker", () => {
    const d = tmp();
    markUpdate(d); // marker but no prior epoch file — must fall back to now, the safe way
    expect(computeSessionEpoch(d, 3000)).toBe(3000);
  });
});
