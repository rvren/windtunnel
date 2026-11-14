import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { databaseUrl } from "./url";

// One pool for the whole server process. In development the module is
// reloaded on every edit, so the pool is kept on globalThis to avoid opening a
// new set of connections each time.
const globalForDb = globalThis as unknown as { windtunnelPool?: Pool };

export function pool(): Pool {
  globalForDb.windtunnelPool ??= new Pool({
    connectionString: databaseUrl(),
    max: 10,
  });
  return globalForDb.windtunnelPool;
}

export function db() {
  return drizzle({ client: pool(), schema });
}

export type Database = ReturnType<typeof db>;
