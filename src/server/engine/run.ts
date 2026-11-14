import { AGENTS, type AgentDefinition } from "@/lib/agents";

import { findCoverage, modelIds, normalizeModel } from "./coverage";
import { RunError, type LlmClient } from "./llm";
import { readProgress } from "./progress";
import {
  AGENT_SYSTEM,
  JUDGE_SYSTEM,
  MODEL_SYSTEM,
  WORK_ORDER_SYSTEM,
  agentPrompt,
  agentSharedContext,
  judgePrompt,
  modelPrompt,
  workOrderPrompt,
} from "./prompts";
import {
  AgentReport,
  DesignModel,
  Verdict,
  WorkOrders,
  ZERO_USAGE,
  addUsage,
  type AgentRun,
  type RunDocument,
  type RunEvent,
  type RunRecord,
  type Scenario,
  type Stage,
  type StoredEvent,
} from "./schema";
import { scoreAgents } from "./score";
import type { RunStore } from "./store";
import {
  checkAgentReport,
  checkWorkOrders,
  reconcileVerdict,
} from "./validate";

/*
 * The orchestrator: one run, five stages.
 *
 *   model → coverage → agents (five, in parallel) → judge → work orders
 *
 * Every step is announced as an event, saved and published, so a page can
 * follow the run live and replay it after a reload.
 */

export interface EngineDeps {
  llm: LlmClient;
  store: RunStore;
  /** Hands a saved event to anyone following the run live. */
  publish: (runId: string, event: StoredEvent) => void;
  now: () => Date;
}

export interface RunInput {
  requirement: string;
  documents: RunDocument[];
}

/** How often, at most, an agent's live progress is read from its stream. */
const PROGRESS_EVERY_MS = 400;

function titleOf(requirement: string): string {
  const line = requirement.trim().split("\n")[0].trim();
  return line.length > 120 ? `${line.slice(0, 117).trimEnd()}…` : line;
}

export function newRun(
  id: string,
  input: RunInput,
  models: RunRecord["models"],
  now: Date,
  sample: boolean,
): RunRecord {
  const at = now.toISOString();
  return {
    id,
    createdAt: at,
    updatedAt: at,
    status: "running",
    stage: null,
    error: null,
    title: titleOf(input.requirement),
    requirement: input.requirement.trim(),
    documents: input.documents,
    models,
    sample,
    designModel: null,
    modelWarnings: [],
    coverage: null,
    agents: AGENTS.map((agent): AgentRun => ({
      agentId: agent.id,
      status: "pending",
      scenarios: [],
      findings: [],
      dropped: [],
      usage: null,
      declinedCategory: null,
      error: null,
    })),
    groups: [],
    rejected: [],
    workOrders: [],
    unaddressedGroupIds: [],
    scoreboard: [],
    usage: {},
  };
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const declined = (what: string, category: string | null) =>
  new RunError(
    `The model declined to ${what}${category ? ` (policy category: ${category})` : ""}.`,
  );

/** Runs the whole pipeline. Never throws: a failure ends up on the run. */
export async function executeRun(
  deps: EngineDeps,
  run: RunRecord,
): Promise<RunRecord> {
  const { llm, store, publish, now } = deps;

  // Events are saved one after another so their order on disk and on the wire
  // is the order they happened in, even with five agents talking at once.
  let seq = 0;
  let queue: Promise<void> = Promise.resolve();
  const emit = (event: RunEvent): Promise<void> => {
    const stored: StoredEvent = {
      seq: (seq += 1),
      at: now().toISOString(),
      event,
    };
    // One failed write must not stop the events behind it from being tried.
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        await store.appendEvent(run.id, stored);
        publish(run.id, stored);
      });
    return queue;
  };

  const save = async () => {
    run.updatedAt = now().toISOString();
    await store.save(run);
  };

  const stage = async (name: Stage, work: () => Promise<string>) => {
    run.stage = name;
    await save();
    await emit({ type: "stage.started", stage: name });
    const summary = await work();
    await save();
    await emit({ type: "stage.completed", stage: name, summary });
  };

  try {
    await save();
    await emit({ type: "run.started" });

    // 1. Model: the requirement becomes an explicit design model.
    await stage("model", async () => {
      const result = await llm.call({
        stage: "model",
        model: run.models.reasoning,
        effort: "high",
        system: MODEL_SYSTEM,
        prompt: modelPrompt(run),
        schema: DesignModel,
      });
      run.usage.model = result.usage;
      if (result.kind === "declined") {
        throw declined("analyse this requirement", result.category);
      }
      const { model, warnings } = normalizeModel(result.value);
      if (model.roles.length === 0 || model.operations.length === 0) {
        throw new RunError(
          "The design model came back with no roles or no operations. Give the requirement more detail and start again.",
        );
      }
      run.designModel = model;
      run.modelWarnings = warnings;
      return `${plural(model.roles.length, "role")}, ${plural(model.operations.length, "operation")}, ${plural(model.rules.length, "rule")}`;
    });
    const model = run.designModel!;

    // 2. Coverage: the gaps code can see. No model call.
    await stage("coverage", async () => {
      run.coverage = findCoverage(model);
      return plural(run.coverage.gaps.length, "gap");
    });
    const coverage = run.coverage!;

    // 3. Agents: five in parallel over one shared, cached context.
    await stage("agents", async () => {
      const shared = agentSharedContext(run, model, coverage);
      const knownIds = new Set([
        ...modelIds(model),
        ...coverage.gaps.map((gap) => gap.id),
      ]);

      // A cache entry can be read only once the request that writes it has
      // begun to answer. So the first agent starts alone, and the other four
      // start when its first bytes arrive and read what it wrote.
      let release!: () => void;
      const firstAnswering = new Promise<void>((resolve) => {
        release = resolve;
      });

      const runAgent = async (definition: AgentDefinition, first: boolean) => {
        const agent = run.agents.find(
          (item) => item.agentId === definition.id,
        )!;
        if (!first) await firstAnswering;
        agent.status = "running";
        await emit({ type: "agent.started", agentId: agent.agentId });

        let lastRead = 0;
        let lastSeen = "";
        try {
          const result = await llm.call({
            stage: "agents",
            model: run.models.agents,
            effort: "medium",
            system: AGENT_SYSTEM,
            shared,
            prompt: agentPrompt(definition),
            schema: AgentReport,
            onStart: first ? release : undefined,
            onText: (soFar) => {
              const at = Date.now();
              if (at - lastRead < PROGRESS_EVERY_MS) return;
              lastRead = at;
              const progress = readProgress(soFar);
              const seen = `${progress.scenarios.length}/${progress.findings}`;
              if (seen === lastSeen) return;
              lastSeen = seen;
              // Progress is best effort: losing one update is harmless.
              emit({
                type: "agent.progress",
                agentId: agent.agentId,
                ...progress,
              }).catch(() => undefined);
            },
          });
          agent.usage = result.usage;

          if (result.kind === "declined") {
            agent.status = "declined";
            agent.declinedCategory = result.category;
            await emit({
              type: "agent.declined",
              agentId: agent.agentId,
              category: result.category,
            });
            return;
          }

          const checked = checkAgentReport(
            agent.agentId,
            result.value,
            knownIds,
          );
          agent.scenarios = result.value.scenarios;
          agent.findings = checked.findings;
          agent.dropped = checked.dropped;
          agent.status = "done";
          await emit({
            type: "agent.completed",
            agentId: agent.agentId,
            scenarios: agent.scenarios.length,
            findings: agent.findings.length,
            dropped: agent.dropped.length,
          });
        } catch (error) {
          agent.status = "failed";
          agent.error = error instanceof Error ? error.message : String(error);
          await emit({
            type: "agent.failed",
            agentId: agent.agentId,
            error: agent.error,
          });
        } finally {
          // Whatever happened to the first agent, the others must not wait
          // for ever.
          if (first) release();
          await save();
        }
      };

      await Promise.all(
        AGENTS.map((definition, index) => runAgent(definition, index === 0)),
      );

      run.usage.agents = run.agents.reduce(
        (sum, agent) => addUsage(sum, agent.usage ?? ZERO_USAGE),
        ZERO_USAGE,
      );

      const done = run.agents.filter((agent) => agent.status === "done");
      if (done.length === 0) {
        const reason = run.agents.find((agent) => agent.error)?.error;
        throw new RunError(
          `No agent finished its work.${reason ? ` ${reason}` : ""}`,
        );
      }
      const findings = done.reduce(
        (sum, agent) => sum + agent.findings.length,
        0,
      );
      return `${plural(findings, "finding")} from ${plural(done.length, "agent")}`;
    });

    const findings = run.agents.flatMap((agent) => agent.findings);

    // 4. Judge: merge duplicates, reject what the design does not support.
    await stage("judge", async () => {
      if (findings.length === 0) {
        run.scoreboard = scoreAgents(run.agents, [], []);
        return "No findings to judge";
      }
      const scenarios = new Map<string, Scenario>(
        run.agents.flatMap((agent) =>
          agent.scenarios.map(
            (scenario) =>
              [`${agent.agentId}/${scenario.id}`, scenario] as const,
          ),
        ),
      );
      const result = await llm.call({
        stage: "judge",
        model: run.models.reasoning,
        effort: "high",
        system: JUDGE_SYSTEM,
        prompt: judgePrompt(run, model, findings, scenarios),
        schema: Verdict,
      });
      run.usage.judge = result.usage;
      if (result.kind === "declined") {
        throw declined("judge the findings", result.category);
      }
      const verdict = reconcileVerdict(result.value, findings);
      run.groups = verdict.groups;
      run.rejected = verdict.rejected;
      run.scoreboard = scoreAgents(run.agents, run.groups, run.rejected);
      return `${plural(run.groups.length, "finding")} accepted, ${run.rejected.length} rejected`;
    });

    // 5. Work orders: what to do about each accepted finding.
    await stage("work_orders", async () => {
      if (run.groups.length === 0) return "No work orders needed";
      const result = await llm.call({
        stage: "work_orders",
        model: run.models.reasoning,
        effort: "medium",
        system: WORK_ORDER_SYSTEM,
        prompt: workOrderPrompt(run, model, run.groups),
        schema: WorkOrders,
      });
      run.usage.work_orders = result.usage;
      if (result.kind === "declined") {
        throw declined("write the work orders", result.category);
      }
      const checked = checkWorkOrders(result.value.workOrders, run.groups);
      run.workOrders = checked.workOrders;
      run.unaddressedGroupIds = checked.unaddressedGroupIds;
      return plural(run.workOrders.length, "work order");
    });

    run.status = "completed";
    run.stage = null;
    await save();
    await emit({ type: "run.completed" });
  } catch (error) {
    run.status = "failed";
    run.error =
      error instanceof RunError
        ? error.message
        : `The run stopped on an unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    for (const agent of run.agents) {
      if (agent.status === "pending" || agent.status === "running") {
        agent.status = "failed";
        agent.error ??= "The run stopped before this agent finished.";
      }
    }
    try {
      await save();
      await emit({ type: "run.failed", error: run.error });
    } catch {
      // The store itself is down; there is nowhere left to report to.
    }
  }

  await queue.catch(() => undefined);
  return run;
}
