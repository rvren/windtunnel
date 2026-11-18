import { AGENTS, type AgentId } from "@/lib/agents";
import { featureOf } from "@/lib/features";
import { STAGE_DESCRIPTION, STAGE_LABEL } from "@/lib/labels";
import type { Feed } from "@/lib/run-feed";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type {
  AgentStatus,
  RunKind,
  RunStatus,
  Severity,
  Stage,
} from "@/server/engine/schema";

/*
 * The crew of a run as it works: who is on it, what each one is doing this
 * moment, and what each has come to. A Tunnel Run and a Crosswind have the
 * five agents; a Fly-off has its designers and judge, a Black Box its
 * investigator and fixer (lib/features.ts). The live view of every kind
 * draws this. Pure; built from the live feed.
 */

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  /** Findings filed so far; null for workers that file none. */
  findings: number | null;
  /** What it is doing now: the file it is reading, or its step. */
  doing: string | null;
  /** What it came to, once done or failed. */
  note: string | null;
  /** Its newest result, while the run is going: a spark in its colour. */
  latest: { uid: string; title: string; color: string } | null;
  /** How far along it is, from 0 to 1: steps so far, nearing 1, then 1. */
  progress: number;
}

export interface Crew {
  members: CrewMember[];
  /** The stage under way, or the last one when the run has ended. */
  stage: { id: Stage; label: string; index: number; count: number } | null;
  /** One plain sentence: what is happening now. */
  sentence: string;
  /** Findings filed so far, by the agents. */
  findings: number;
  /** Every finding filed so far, oldest first. */
  found: { uid: string; agentId: string; severity: Severity }[];
  /** How the run ended: null while it goes on. */
  outcome: "completed" | "failed" | null;
  ended: boolean;
}

/** Each step (a file read, a scenario, a finding) closes a share of the gap. */
const STEP = 0.18;

function progressOf(status: AgentStatus, steps: number): number {
  if (status === "done") return 1;
  if (status === "pending") return 0;
  return Math.min(0.92, 1 - Math.pow(1 - STEP, steps + 1));
}

/** The five agents of a Tunnel Run or a Crosswind. */
function agentsOf(feed: Feed): CrewMember[] {
  return AGENTS.map(({ id, name, body }) => {
    const live = feed.agents[id as AgentId];
    const latest = feed.ended
      ? null
      : (feed.live.find((item) => item.agentId === id) ?? null);
    return {
      id,
      name,
      role: body,
      status: live.status,
      findings: live.findings,
      doing:
        live.status === "running"
          ? (live.reading ?? live.scenarios.at(-1) ?? null)
          : null,
      note: live.status === "running" ? null : live.note,
      latest: latest
        ? {
            uid: latest.uid,
            title: latest.title,
            color: SEVERITY_TONE[latest.severity],
          }
        : null,
      progress: progressOf(
        live.status,
        live.reads + live.scenarios.length + live.findings,
      ),
    };
  });
}

/** The workers of a Fly-off or a Black Box. */
function actorsOf(feed: Feed, kind: RunKind): CrewMember[] {
  return featureOf(kind).actors.map(({ id, name, role }) => {
    const live = feed.actors[id];
    const status = live?.status ?? "pending";
    return {
      id,
      name,
      role,
      status,
      findings: null,
      doing:
        status === "running" ? (live?.reading ?? live?.doing ?? null) : null,
      note: status === "running" ? null : (live?.note ?? null),
      latest:
        live && live.done > 0 && !feed.ended
          ? {
              uid: `${id}#${live.done}`,
              title: live.note ?? "",
              color: "var(--brand)",
            }
          : null,
      progress: progressOf(status, (live?.reads ?? 0) + (live?.done ?? 0)),
    };
  });
}

/** "A", "A and B", "A, B and C". */
function listOf(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function crewOf(
  feed: Feed,
  run: {
    kind: RunKind;
    stages: readonly Stage[];
    subject: string;
    /** The saved run's status, when known: an interrupted run sends no end. */
    status?: RunStatus;
  },
): Crew {
  const agents = run.kind === "audit" || run.kind === "crosswind";
  const members = agents ? agentsOf(feed) : actorsOf(feed, run.kind);

  const states = run.stages.map((id) => feed.stages[id].state);
  let at = states.findIndex((state) => state === "running");
  if (at < 0) at = states.findLastIndex((state) => state !== "pending");
  const stage =
    at >= 0
      ? {
          id: run.stages[at],
          label: STAGE_LABEL[run.stages[at]],
          index: at + 1,
          count: run.stages.length,
        }
      : null;

  const ended = feed.ended || (run.status ?? "running") !== "running";
  const failed =
    run.status === "failed" ||
    run.status === "interrupted" ||
    states.includes("failed");
  const outcome = ended ? (failed ? "failed" : "completed") : null;
  const working = ended
    ? []
    : members.filter((member) => member.status === "running");
  const findings = members.reduce((sum, m) => sum + (m.findings ?? 0), 0);
  const sentence = failed
    ? `The run stopped${stage ? ` at ${stage.label}` : ""}.`
    : ended
      ? agents
        ? `The agents filed ${findings} ${findings === 1 ? "finding" : "findings"} before the judge merged them.`
        : `${featureOf(run.kind).name} is done.`
      : working.length > 0
        ? agents
          ? `${working.length} ${working.length === 1 ? "agent is" : "agents are"} testing ${run.subject}.`
          : `${listOf(working.map((m) => m.name))} ${working.length === 1 ? "is" : "are"} at work on ${run.subject}.`
        : stage
          ? `${STAGE_DESCRIPTION[stage.id]}.`
          : `Starting the run on ${run.subject}.`;

  const found = feed.live
    .map(({ uid, agentId, severity }) => ({ uid, agentId, severity }))
    .reverse();
  return { members, stage, sentence, findings, found, outcome, ended };
}
