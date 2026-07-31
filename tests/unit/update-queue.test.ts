import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  queueAddonUpdates,
  hasQueuedAddonUpdates,
  takeQueuedAddonUpdates,
  clearQueuedAddonUpdates,
} from "@/lib/update-queue";

/** REFS lib/update-queue.ts */

/*
 * "Update everything" runs JonDash first, then its add-ons. The core update restarts the
 * process, so the add-on half is written down and picked up afterwards. The safety property
 * that matters most: the queue is CONSUMED as it is read, so a failing add-on stage is
 * attempted once and reported — never retried into a restart loop.
 */

const QUEUE = path.join(process.cwd(), ".data", "pending-addon-updates");

afterEach(() => clearQueuedAddonUpdates());

describe("queued add-on updates (Update everything, stage two)", () => {
  it("round-trips what was queued", () => {
    queueAddonUpdates({ moduleIds: ["health-monitor"], helperIds: ["scheduler"], consented: ["health-monitor"] });
    expect(hasQueuedAddonUpdates()).toBe(true);
    expect(takeQueuedAddonUpdates()).toEqual({
      moduleIds: ["health-monitor"],
      helperIds: ["scheduler"],
      consented: ["health-monitor"],
    });
  });

  it("is consumed on read, so a failed stage two can't retry forever", () => {
    queueAddonUpdates({ moduleIds: ["a"], helperIds: [], consented: [] });
    expect(takeQueuedAddonUpdates()).not.toBeNull();
    expect(hasQueuedAddonUpdates()).toBe(false); // gone after one read
    expect(takeQueuedAddonUpdates()).toBeNull();
  });

  it("queues nothing when there are no add-ons (core-only update)", () => {
    queueAddonUpdates({ moduleIds: [], helperIds: [], consented: [] });
    expect(hasQueuedAddonUpdates()).toBe(false);
  });

  it("drops an unreadable queue rather than guessing", () => {
    fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
    fs.writeFileSync(QUEUE, "{ not json");
    expect(takeQueuedAddonUpdates()).toBeNull();
    expect(hasQueuedAddonUpdates()).toBe(false);
  });

  it("ignores non-string entries in a tampered queue", () => {
    fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
    fs.writeFileSync(QUEUE, JSON.stringify({ moduleIds: ["ok", 42, null], helperIds: "nope", consented: [] }));
    expect(takeQueuedAddonUpdates()).toEqual({ moduleIds: ["ok"], helperIds: [], consented: [] });
  });

  it("reports nothing waiting when the file was never written", () => {
    expect(hasQueuedAddonUpdates()).toBe(false);
    expect(takeQueuedAddonUpdates()).toBeNull();
  });
});
