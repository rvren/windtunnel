import { activeRunIds, runStore } from "../engine/registry";
import { adoptLooseRuns } from "../projects/adopt";
import { migrateDatabase } from "./migrate";

// Brings the database up to date once per server process: applies new
// migrations, marks any run that a restart cut off, and gives a project to
// any run that has none. If the database is
// not reachable yet the next call tries again, so the app recovers by itself
// when Postgres comes up after it.
const globalForReady = globalThis as unknown as {
  windtunnelDatabaseReady?: Promise<void>;
};

export function ensureDatabase(): Promise<void> {
  globalForReady.windtunnelDatabaseReady ??= (async () => {
    await migrateDatabase();
    await runStore().markInterrupted(activeRunIds());
    await adoptLooseRuns();
  })().catch((error) => {
    globalForReady.windtunnelDatabaseReady = undefined;
    throw error;
  });
  return globalForReady.windtunnelDatabaseReady;
}
