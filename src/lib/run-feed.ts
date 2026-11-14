import { AGENT_IDS, type AgentId } from "@/lib/agents";
import { STAGE_ORDER } from "@/lib/labels";
import type {
  AgentStatus,
  Architecture,
  LiveFinding,
  RunEvent,
  Stage,
} from "@/server/engine/schema";

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
      /** In a repository run: the file the agent last opened. */
      reading: string | null;
    }
  >;
  /** In a project run: the workspaces whose code has arrived, in order. */
  workspaces: { name: string; label: string }[];
  /** How the application is put together, once the model stage has said. */
  architecture: Architecture | null;
  /** Findings as they are filed, newest first, before the judge rules. */
  live: (LiveFinding & { agentId: AgentId })[];
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
    agents[id] = {
      status: "pending",
      scenarios: [],
      findings: 0,
      note: null,
      reading: null,
    };
  }
  return {
    stages,
    agents,
    workspaces: [],
    architecture: null,
    live: [],
    ended: false,
  };
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
    case "workspace.ready":
      if (feed.workspaces.some((item) => item.name === event.name)) return feed;
      return {
        ...feed,
        workspaces: [
          ...feed.workspaces,
          { name: event.name, label: event.label },
        ],
      };
    case "remediation.ready":
      return feed;
    case "architecture.ready":
      return { ...feed, architecture: event.architecture };
    case "agent.started":
      return agent(event.agentId, { status: "running" });
    case "agent.progress":
      return agent(event.agentId, {
        scenarios: event.scenarios,
        findings: event.findings,
      });
    case "agent.reading":
      return agent(event.agentId, { reading: event.path });
    case "agent.finding": {
      if (feed.live.some((item) => item.uid === event.finding.uid)) return feed;
      const next = agent(event.agentId, {
        findings: feed.agents[event.agentId].findings + 1,
      });
      return {
        ...next,
        live: [{ ...event.finding, agentId: event.agentId }, ...feed.live],
      };
    }
    case "agent.completed":
      return agent(event.agentId, {
        status: "done",
        reading: null,
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
      return { ...feed, stages, agents, ended: true };
    }
  }
}
