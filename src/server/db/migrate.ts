import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db } from "./client";

/** Applies any SQL files in drizzle/ that this database has not seen yet. */
export async function migrateDatabase(): Promise<void> {
  await migrate(db(), {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
}
