import { defineConfig } from "vitest/config";
import path from "node:path";

const root = process.cwd();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // Tests share one SQLite DB and reset between cases, so run serially.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./vitest.db",
      // Deterministic 32-byte key (64 hex) so crypto round-trips are stable.
      ENCRYPTION_KEY: "0".repeat(64),
    },
  },
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws when imported outside a React Server Component;
      // stub it so we can unit-test the server libraries directly.
      "server-only": path.resolve(root, "tests/stubs/server-only.ts"),
    },
  },
});
