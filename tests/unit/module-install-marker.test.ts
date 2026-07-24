import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { markModuleInstalling, clearModuleInstalling, INSTALLING_MARKER } from "@/lib/modules/rebuild";

// BUG-36: the `.data/module-installing` marker names the modules a rebuild is applying, so a
// FAILED build can roll them back. Nothing cleared it on SUCCESS, so it lingered forever and
// the next unrelated build failure removed a healthy module. clearModuleInstalling closes that.

afterEach(() => fs.rmSync(INSTALLING_MARKER, { force: true }));

describe("module-installing marker", () => {
  it("is written by mark and removed by clear", () => {
    markModuleInstalling(["health-monitor", "backup-manager"]);
    expect(fs.existsSync(INSTALLING_MARKER)).toBe(true);
    expect(fs.readFileSync(INSTALLING_MARKER, "utf8")).toBe("health-monitor\nbackup-manager");

    clearModuleInstalling();
    expect(fs.existsSync(INSTALLING_MARKER)).toBe(false);
  });

  it("clearing is safe when there is no marker", () => {
    fs.rmSync(INSTALLING_MARKER, { force: true });
    expect(() => clearModuleInstalling()).not.toThrow();
    expect(fs.existsSync(INSTALLING_MARKER)).toBe(false);
  });
});
