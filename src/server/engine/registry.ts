import { randomUUID } from "node:crypto";

import { deliverRun } from "../connectors/deliver";
import { db } from "../db/client";
import { engineConfig } from "./config";
import { AnthropicLlm, RunError } from "./llm";
import { executeRun, newRun, type RunInput } from "./run";
import { SAMPLE_SCRIPT, ScriptedLlm, type Script } from "./sample";
import { sampleTriage } from "./sample-kinds";
import { sampleProjectScript, sampleServiceOf } from "./sample-project";
import { kindOf, type RunRecord, type StoredEvent } from "./schema";
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
 * A sample project's script, with what a black box run on it needs: the
 * catalog's search, which fails on a quote.
 */
function withKindSamples(script: Script, input: RunInput): Script {
  if (input.kind !== "blackbox" || !input.project) return script;
  const workspaces = input.project.workspaces;
  const catalog = workspaces.find(
    (item) => sampleServiceOf(item.origin) === "catalog",
  );
  if (!catalog) return script;
  const path =
    workspaces.length > 1 ? `${catalog.name}/search.py` : "search.py";
  return {
    ...script,
    kinds: { ...script.kinds, triage: sampleTriage(path) },
    // The defect is the catalog's SQL injection: its scripted fix applies.
    remediations: script.remediations?.["g-cat-sqli"]
      ? {
          ...script.remediations,
          "incident-1": script.remediations["g-cat-sqli"],
        }
      : script.remediations,
  };
}

/**
 * Saves a new run and starts it in the background. The run goes on in this
 * server process whether or not anyone is watching.
 */
export async function startRun(input: RunInput): Promise<RunRecord> {
  const config = engineConfig();
  // A demo project's runs, and every run in sample mode, replay a script.
  // They never reach the Claude API.
  const scripted =
    config.sampleMode ||
    input.project?.demo === true ||
    input.projectRef?.demo === true;
  if (!scripted && !config.hasApiKey) {
    throw new RunError(
      "No API key is set. Add ANTHROPIC_API_KEY to .env.local and restart the server.",
    );
  }

  const store = runStore();
  const run = newRun(randomUUID(), input, config.models, new Date(), scripted);
  await store.save(run);

  const llm = scripted
    ? new ScriptedLlm(
        input.project
          ? withKindSamples(
              sampleProjectScript(
                input.project.workspaces.map((item) => ({
                  name: item.name,
                  service: sampleServiceOf(item.origin),
                })),
              ),
              input,
            )
          : SAMPLE_SCRIPT,
        // Paced so the live view has something to show.
        { delayMs: input.project ? 1000 : 900 },
      )
    : new AnthropicLlm();

  state().active.add(run.id);
  void executeRun({ llm, store, publish, now: () => new Date() }, run)
    .then(async (done) => {
      // Only an audit's findings are the project's issues and work orders.
      // A Crosswind run's breaks belong to its change; a fly-off and a
      // black box have their own outputs.
      if (kindOf(done) === "blackbox") {
        // A black box defect is an issue in the project's code.
        await import("../issues/store")
          .then(({ trackIncident }) => trackIncident(done))
          .catch((error) =>
            console.error(
              "[windtunnel] The defect could not be tracked:",
              error,
            ),
          );
        return;
      }
      if (kindOf(done) !== "audit") return;
      // The run is over. Its issues fold into the project's tracked ones
      // (imported here: the issue store reads runs through this module).
      await import("../issues/store")
        .then(({ reconcileRun }) => reconcileRun(done))
        .catch((error) =>
          console.error("[windtunnel] Issues could not be tracked:", error),
        );
      // Its work orders go to the linked connector, if any.
      await deliverRun(done).catch((error) =>
        console.error("[windtunnel] Work orders could not be sent:", error),
      );
    })
    .finally(() => state().active.delete(run.id));

  return run;
}
