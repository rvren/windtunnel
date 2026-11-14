import { defineConfig } from "drizzle-kit";

import { databaseUrl } from "./src/server/db/url";

// `pnpm db:generate` turns src/server/db/schema.ts into SQL files in drizzle/.
// The app applies them itself when it starts (src/instrumentation.ts).
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl() },
});
