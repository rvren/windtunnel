import { randomUUID } from "node:crypto";

import { db } from "../db/client";
import { engineConfig } from "./config";
import { AnthropicLlm, RunError } from "./llm";
import { executeRun, newRun, type RunInput } from "./run";
import { SAMPLE_SCRIPT, ScriptedLlm } from "./sample";
import { sampleProjectScript } from "./sample-project";
import type { RunRecord, StoredEvent } from "./schema";
import { PgRunStore, type RunStore } from "./store";

/*
 * The live side of the engine: which runs are going on in this server
 * process, and who is following them.
 *
 * It lives on globalThis because in development the module is reloaded on
 * every edit, and a run in progress must survive that.
 */

type Listener = (event: StoredEvent) => void;

interface EngineState {
  active: Set<string>;
  listeners: Map<string, Set<Listener>>;
}

const globalForEngine = globalThis as unknown as {
  windtunnelEngine?: EngineState;
};

function state(): EngineState {
  globalForEngine.windtunnelEngine ??= {
    active: new Set(),
    listeners: new Map(),
  };
  return globalForEngine.windtunnelEngine;
}

export function runStore(): RunStore {
  return new PgRunStore(db());
}

/** Is this run going on in this process right now? */
export function isActive(runId: string): boolean {
  return state().active.has(runId);
}

export function activeRunIds(): string[] {
  return [...state().active];
}

/** Follows a run live. Returns the function that stops following. */
export function subscribe(runId: string, listener: Listener): () => void {
  const { listeners } = state();
  const set = listeners.get(runId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(runId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(runId);
  };
}

function publish(runId: string, event: StoredEvent) {
  for (const listener of state().listeners.get(runId) ?? []) listener(event);
}

/**
 * Saves a new run and starts it in the background. The run goes on in this
 * server process whether or not anyone is watching.
 */
export async function startRun(input: RunInput): Promise<RunRecord> {
  const config = engineConfig();
  if (!config.sampleMode && !config.hasApiKey) {
    throw new RunError(
      "No API key is set. Add ANTHROPIC_API_KEY to .env.local and restart the server.",
    );
  }

  const store = runStore();
  const run = newRun(
    randomUUID(),
    input,
    config.models,
    new Date(),
    config.sampleMode,
  );
  await store.save(run);

  const llm = config.sampleMode
    ? new ScriptedLlm(
        input.project
          ? sampleProjectScript(
              input.project.workspaces.map((item) => item.name),
            )
          : SAMPLE_SCRIPT,
        { delayMs: input.project ? 350 : 900 },
      )
    : new AnthropicLlm();

  state().active.add(run.id);
  void executeRun({ llm, store, publish, now: () => new Date() }, run).finally(
    () => state().active.delete(run.id),
  );

  return run;
}
