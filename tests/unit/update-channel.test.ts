import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  readChannel,
  writeChannel,
  manifestUrl,
  branchForChannel,
  isChannel,
  DEFAULT_CHANNEL,
} from "@/lib/update-channel";

// readChannel/writeChannel touch .data/update-channel under cwd — snapshot + restore.
const FILE = path.join(process.cwd(), ".data", "update-channel");
const backup = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
afterAll(() => {
  if (backup) fs.writeFileSync(FILE, backup);
  else fs.rmSync(FILE, { force: true });
});

describe("update channel", () => {
  it("defaults to stable when nothing is stored", () => {
    fs.rmSync(FILE, { force: true });
    expect(readChannel()).toBe("stable");
    expect(DEFAULT_CHANNEL).toBe("stable");
  });

  it("round-trips a written channel", () => {
    writeChannel("beta");
    expect(readChannel()).toBe("beta");
    writeChannel("stable");
    expect(readChannel()).toBe("stable");
  });

  it("falls back to stable on an invalid stored value", () => {
    fs.writeFileSync(FILE, "nonsense");
    expect(readChannel()).toBe("stable");
  });

  it("maps channel → branch → manifest URL", () => {
    expect(branchForChannel("stable")).toBe("main");
    expect(branchForChannel("beta")).toBe("beta");
    expect(manifestUrl("stable")).toContain("/main/updates.json");
    expect(manifestUrl("beta")).toContain("/beta/updates.json");
  });

  it("isChannel validates the two channels", () => {
    expect(isChannel("stable")).toBe(true);
    expect(isChannel("beta")).toBe(true);
    expect(isChannel("nope")).toBe(false);
    expect(isChannel(undefined)).toBe(false);
  });
});
