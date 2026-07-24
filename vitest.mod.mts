import { defineConfig } from "vitest/config";
import path from "node:path";

const root = process.cwd();

/**
 * Test config for MODULE and HELPER tests (BUG-33).
 *
 * A module's own tests live in `modules/<id>/tests/**` and usually need the database — the
 * data layer is the interesting part of a module. The main `vitest.config.ts` only includes
 * `tests/**`, so there was no supported way to run them: an author had to hand-copy their
 * test into `tests/` or invent their own config with no DB wiring. This one gives them the
 * same throwaway, migrated SQLite database the core suite uses.
 *
 * Run with `npm run test:modules` (or point a module's own harness at it). `passWithNoTests`
 * keeps a stock checkout — where `modules/` is empty — green.
 *
 * The globalSetup + server-only stub live in `test-support/`, NOT `tests/`, on purpose: `tests/`
 * is `export-ignore`d from the downloadable archive, and this config SHIPS — a module author
 * running `test:modules` against a downloaded release must still find both files. Keep them in
 * `test-support/` (which ships); moving them under `tests/` breaks the download (BUG-33 follow-up).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["modules/**/tests/**/*.test.ts", "helpers/**/tests/**/*.test.ts"],
    globalSetup: ["./test-support/global-setup.ts"],
    passWithNoTests: true,
    // One shared SQLite DB, reset between cases — run serially.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // Throwaway DB, created and migrated by global-setup and deleted after. A module test
      // that touches the database should assert this shape and refuse to run against a real
      // `dev.db`, so a stray run can never write production data.
      DATABASE_URL: "file:./vitest.db",
      ENCRYPTION_KEY: "0".repeat(64),
    },
  },
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws outside a React Server Component; stub it so module code that
      // imports core server libraries can be unit-tested directly.
      "server-only": path.resolve(root, "test-support/server-only.ts"),
    },
  },
});
