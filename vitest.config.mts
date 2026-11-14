import path from "node:path";

import { defineConfig } from "vitest/config";

// Unit tests: no network and no database. `pnpm test:db` runs the others.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "docs/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts"],
  },
});
