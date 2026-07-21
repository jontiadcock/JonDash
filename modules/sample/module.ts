import type { ModuleDefinition } from "@/lib/modules/types";
import SampleWidget from "./widget";
import SamplePage from "./page";

/**
 * Sample notes — the bundled reference module that proves the framework end to end:
 * a heading setting, its own `mod_sample_notes` table (via a SQL migration), a
 * dashboard widget, and its own page at /m/sample. Needs no permissions beyond the
 * baseline (a module always gets its own settings + its own tables).
 */
const sample: ModuleDefinition = {
  id: "sample",
  name: "Sample notes",
  description: "A tiny demo: a heading setting, a notes table, a dashboard widget, and its own page.",
  version: "1.0.0",
  minAppVersion: "1.4.0",
  permissions: [],
  settings: [{ key: "heading", label: "Widget heading", type: "string", default: "Quick notes" }],
  DashboardWidget: SampleWidget,
  Page: SamplePage,
  migrations: "./migrations",
  async onEnable(ctx) {
    // Prove a module can write to its own table on enable.
    if (ctx.db) {
      await ctx.db.run(
        `INSERT INTO ${ctx.db.table("notes")} (text, createdAt) VALUES (?, ?)`,
        "Sample module enabled",
        new Date().toISOString(),
      );
    }
  },
};

export default sample;
