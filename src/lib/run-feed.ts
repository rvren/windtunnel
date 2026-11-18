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
      /** How many files it has opened so far. */
      reads: number;
    }
  >;
  /**
   * The workers of the newer kinds (a fly-off's designers and judge, a black
   * box's investigator and fixer), by id, once they have started.
   */
  actors: Record<string, Actor>;
  /** In a project run: the workspaces whose code has arrived, in order. */
  workspaces: { name: string; label: string }[];
  /** How the application is put together, once the model stage has said. */
  architecture: Architecture | null;
  /** Findings as they are filed, newest first, before the judge rules. */
  live: (LiveFinding & { agentId: AgentId })[];
  /** True once the run has said its last word. */
  ended: boolean;
}

export interface Actor {
  status: AgentStatus;
  /** What it is on now, while it works. */
  doing: string | null;
  /** The file it last opened, while it works. */
  reading: string | null;
  reads: number;
  /** What it came to, once done (or why it failed). */
  note: string | null;
  /** How many times it has finished a piece of work. */
  done: number;
}

const NEW_ACTOR: Actor = {
  status: "pending",
  doing: null,
  reading: null,
  reads: 0,
  note: null,
  done: 0,
};

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
      reads: 0,
    };
  }
  return {
    stages,
    agents,
    actors: {},
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

  const actor = (id: string, change: (now: Actor) => Partial<Actor>): Feed => {
    const now = feed.actors[id] ?? NEW_ACTOR;
    return {
      ...feed,
      actors: { ...feed.actors, [id]: { ...now, ...change(now) } },
    };
  };

  switch (event.type) {
    case "run.started":
      return feed;
    case "actor.started":
      return actor(event.actorId, () => ({
        status: "running",
        doing: event.doing,
        reading: null,
      }));
    case "actor.reading":
      return actor(event.actorId, (now) => ({
        reading: event.path,
        reads: now.reads + 1,
      }));
    case "actor.completed":
      return actor(event.actorId, (now) => ({
        status: "done",
        doing: null,
        reading: null,
        note: event.note,
        done: now.done + 1,
      }));
    case "actor.failed":
      return actor(event.actorId, () => ({
        status: "failed",
        doing: null,
        reading: null,
        note: event.error,
      }));
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
      return agent(event.agentId, {
        reading: event.path,
        reads: feed.agents[event.agentId].reads + 1,
      });
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
      const actors = { ...feed.actors };
      for (const [id, item] of Object.entries(actors)) {
        if (item.status === "running") {
          actors[id] = { ...item, status: "failed", doing: null };
        }
      }
      return { ...feed, stages, agents, actors, ended: true };
    }
  }
}

/**
 * Each agent's state for display: the live feed when it has heard of the
 * agent, otherwise what the saved run holds. A finished run read before its
 * events replay (or with no events) still shows its agents as done.
 */
export function agentStates(
  feed: Feed,
  saved: { agentId: AgentId; status: AgentStatus; findings: unknown[] }[],
): Record<AgentId, { status: AgentStatus; findings: number }> {
  const out = {} as Record<AgentId, { status: AgentStatus; findings: number }>;
  for (const id of AGENT_IDS) {
    const live = feed.agents[id];
    const stored = saved.find((agent) => agent.agentId === id);
    out[id] =
      live.status === "pending" && stored
        ? { status: stored.status, findings: stored.findings.length }
        : { status: live.status, findings: live.findings };
  }
  return out;
}
