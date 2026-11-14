import { AGENT_IDS, type AgentId } from "@/lib/agents";
import { STAGE_ORDER } from "@/lib/labels";
import type { AgentStatus, RunEvent, Stage } from "@/server/engine/schema";

/*
 * The live picture of a run, built from its events alone. The run page
 * replays the saved events and then follows the live ones, so one reducer
 * serves a run in progress, a finished run and a page reloaded half-way.
 */

export type StageState = "pending" | "running" | "done" | "failed";

export interface Feed {
  stages: Record<Stage, { state: StageState; summary: string | null }>;
  agents: Record<
    AgentId,
    {
      status: AgentStatus;
      /** Scenario titles seen so far, while the agent is still answering. */
      scenarios: string[];
      findings: number;
      note: string | null;
    }
  >;
  /** True once the run has said its last word. */
  ended: boolean;
}

export function emptyFeed(): Feed {
  const stages = {} as Feed["stages"];
  for (const stage of STAGE_ORDER) {
    stages[stage] = { state: "pending", summary: null };
  }
  const agents = {} as Feed["agents"];
  for (const id of AGENT_IDS) {
    agents[id] = { status: "pending", scenarios: [], findings: 0, note: null };
  }
  return { stages, agents, ended: false };
}

export function applyEvent(feed: Feed, event: RunEvent): Feed {
  const stage = (
    name: Stage,
    change: Partial<Feed["stages"][Stage]>,
  ): Feed => ({
    ...feed,
    stages: { ...feed.stages, [name]: { ...feed.stages[name], ...change } },
  });
  const agent = (
    id: AgentId,
    change: Partial<Feed["agents"][AgentId]>,
  ): Feed => ({
    ...feed,
    agents: { ...feed.agents, [id]: { ...feed.agents[id], ...change } },
  });

  switch (event.type) {
    case "run.started":
      return feed;
    case "stage.started":
      return stage(event.stage, { state: "running" });
    case "stage.completed":
      return stage(event.stage, { state: "done", summary: event.summary });
    case "agent.started":
      return agent(event.agentId, { status: "running" });
    case "agent.progress":
      return agent(event.agentId, {
        scenarios: event.scenarios,
        findings: event.findings,
      });
    case "agent.completed":
      return agent(event.agentId, {
        status: "done",
        findings: event.findings,
        note:
          event.dropped > 0
            ? `${event.dropped} dropped by the citation check`
            : null,
      });
    case "agent.declined":
      return agent(event.agentId, {
        status: "declined",
        note: event.category
          ? `Declined by the model (${event.category})`
          : "Declined by the model",
      });
    case "agent.failed":
      return agent(event.agentId, { status: "failed", note: event.error });
    case "run.completed":
      return { ...feed, ended: true };
    case "run.failed": {
      // Whatever was in progress is what failed.
      const stages = { ...feed.stages };
      for (const name of STAGE_ORDER) {
        if (stages[name].state === "running") {
          stages[name] = { ...stages[name], state: "failed" };
        }
      }
      const agents = { ...feed.agents };
      for (const id of AGENT_IDS) {
        if (
          agents[id].status === "running" ||
          agents[id].status === "pending"
        ) {
          agents[id] = { ...agents[id], status: "failed" };
        }
      }
      return { stages, agents, ended: true };
    }
  }
}
