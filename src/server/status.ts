import { sql } from "drizzle-orm";

import { db } from "./db/client";
import { ensureDatabase } from "./db/ready";
import { databaseLabel } from "./db/url";
import { engineConfig } from "./engine/config";

export interface EngineStatus {
  database: { up: boolean; address: string; error: string | null };
  /** Whether a key is present. The key itself is never sent anywhere. */
  apiKey: boolean;
  sampleMode: boolean;
  models: { reasoning: string; agents: string };
  /** Can a run start right now? */
  ready: boolean;
}

/** What the engine needs to run, and whether it has it. Holds no secrets. */
export async function engineStatus(): Promise<EngineStatus> {
  const config = engineConfig();
  let error: string | null = null;
  try {
    await ensureDatabase();
    await db().execute(sql`select 1`);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const up = error === null;
  return {
    database: { up, address: databaseLabel(), error },
    apiKey: config.hasApiKey,
    sampleMode: config.sampleMode,
    models: config.models,
    ready: up && (config.hasApiKey || config.sampleMode),
  };
}
