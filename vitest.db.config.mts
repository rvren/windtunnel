import path from "node:path";

import { defineConfig } from "vitest/config";

// Tests that need Postgres. They use the separate windtunnel_test database
// that docker/init-test-db.sql creates, so they never touch real runs.
// Start the database first: `pnpm db:up`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.db.test.ts"],
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://windtunnel:windtunnel-dev-only@localhost:5433/windtunnel_test",
    },
    fileParallelism: false,
  },
});
