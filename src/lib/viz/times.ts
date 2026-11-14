import type { AgentId } from "@/lib/agents";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/labels";
import type {
  RunEvent,
  Severity,
  Stage,
  StoredEvent,
} from "@/server/engine/schema";

/*
 * When each part of a run started and ended, read from its events alone.
 * Times are milliseconds since the epoch. Nothing is guessed: a part with no
 * event has no time.
 */

export interface Span {
  start: number;
  /** Absent while it is still going. */
  end?: number;
}

/** A moment in an agent's work: a scenario walked or a finding filed. */
export interface AgentMark {
  agentId: AgentId;
  at: number;
  kind: "scenario" | "finding";
  /** For a finding: how bad the agent said it was. */
  severity?: Severity;
}

export interface RunTimes {
  start: number | null;
  end: number | null;
  stages: Partial<Record<Stage, Span>>;
  agents: Partial<Record<AgentId, Span>>;
  /** When each scenario and finding arrived, in order. */
  marks: AgentMark[];
  /** Scenarios seen so far per agent, to tell a new one from a repeat. */
  scenarios: Partial<Record<AgentId, number>>;
}

export function emptyTimes(): RunTimes {
  return {
    start: null,
    end: null,
    stages: {},
    agents: {},
    marks: [],
    scenarios: {},
  };
}

/** Adds one event to the times. Pure: returns the same object when unchanged. */
export function applyTime(
  times: RunTimes,
  event: RunEvent,
  at: string | undefined,
): RunTimes {
  const when = at ? Date.parse(at) : NaN;
  if (Number.isNaN(when)) return times;
  switch (event.type) {
    case "run.started":
      return { ...times, start: times.start ?? when };
    case "run.completed":
    case "run.failed":
      return { ...times, end: when };
    case "stage.started":
      return {
        ...times,
        start: times.start ?? when,
        stages: { ...times.stages, [event.stage]: { start: when } },
      };
    case "stage.completed": {
      const span = times.stages[event.stage];
      return {
        ...times,
        stages: {
          ...times.stages,
          [event.stage]: { start: span?.start ?? when, end: when },
        },
      };
    }
    case "agent.progress": {
      const before = times.scenarios[event.agentId] ?? 0;
      const now = event.scenarios.length;
      if (now <= before) return times;
      const added: AgentMark[] = Array.from({ length: now - before }, () => ({
        agentId: event.agentId,
        at: when,
        kind: "scenario",
      }));
      return {
        ...times,
        marks: [...times.marks, ...added],
        scenarios: { ...times.scenarios, [event.agentId]: now },
      };
    }
    case "agent.finding":
      return {
        ...times,
        marks: [
          ...times.marks,
          {
            agentId: event.agentId,
            at: when,
            kind: "finding",
            severity: event.finding.severity,
          },
        ],
      };
    case "agent.started":
      return {
        ...times,
        agents: { ...times.agents, [event.agentId]: { start: when } },
      };
    case "agent.completed":
    case "agent.declined":
    case "agent.failed": {
      const span = times.agents[event.agentId];
      if (!span) return times;
      return {
        ...times,
        agents: { ...times.agents, [event.agentId]: { ...span, end: when } },
      };
    }
    default:
      return times;
  }
}

export function timesFrom(events: StoredEvent[]): RunTimes {
  return events.reduce(
    (times, stored) => applyTime(times, stored.event, stored.at),
    emptyTimes(),
  );
}

/** Seconds each finished stage took. */
export function stageSplits(times: RunTimes): Partial<Record<Stage, number>> {
  const splits: Partial<Record<Stage, number>> = {};
  for (const stage of STAGE_ORDER) {
    const span = times.stages[stage];
    if (span?.end !== undefined) splits[stage] = (span.end - span.start) / 1000;
  }
  return splits;
}

/** The finished stages as segments of one bar, in order, with their seconds. */
export function stageSegments(times: RunTimes) {
  const splits = stageSplits(times);
  return STAGE_ORDER.filter((stage) => splits[stage] !== undefined).map(
    (stage) => ({
      id: stage,
      label: STAGE_LABEL[stage],
      seconds: splits[stage]!,
    }),
  );
}

/** Seconds from the run's start to `now`, or to its end once it ended. */
export function elapsedSeconds(times: RunTimes, now: number): number {
  if (times.start === null) return 0;
  return Math.max(0, ((times.end ?? now) - times.start) / 1000);
}
