import { z } from "zod";

import { AGENT_IDS } from "@/lib/agents";

/*
 * The shapes the engine works with.
 *
 * The first half is what the model returns at each stage. Those schemas go to
 * the Claude API as structured-output formats, which puts limits on them:
 * every field is required (use `.nullable()`, never `.optional()`), and no
 * schema refers to itself.
 *
 * The second half is what the engine stores and what the screens read.
 */

// ── Stage 1: the design model ───────────────────────────────────────────────

/** Did the requirement say this, or did the model have to assume it? */
export const Source = z.enum(["stated", "assumed"]);

export const DesignModel = z.object({
  summary: z.string(),
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      source: Source,
    }),
  ),
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      fields: z.array(z.string()),
      /** Any stated cap on how many there can be, or null if none is given. */
      limit: z.string().nullable(),
      source: Source,
    }),
  ),
  operations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      entityIds: z.array(z.string()),
      preconditions: z.array(z.string()),
      effects: z.array(z.string()),
      /** What the design says happens if this fails part-way, or null. */
      failureBehaviour: z.string().nullable(),
      source: Source,
    }),
  ),
  permissions: z.array(
    z.object({
      operationId: z.string(),
      roleId: z.string(),
      effect: z.enum(["allow", "deny", "conditional"]),
      condition: z.string().nullable(),
      source: Source,
    }),
  ),
  rules: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["invariant", "validation", "limit", "security", "other"]),
      statement: z.string(),
      source: Source,
    }),
  ),
  journeys: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      roleId: z.string(),
      operationIds: z.array(z.string()),
      source: Source,
    }),
  ),
});
export type DesignModel = z.infer<typeof DesignModel>;

// ── Stage 3: one agent's report ─────────────────────────────────────────────

export const FindingType = z.enum([
  "missing_requirement",
  "architecture_weakness",
  "security_vulnerability",
  "unhandled_journey",
]);
export type FindingType = z.infer<typeof FindingType>;

export const Severity = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof Severity>;

export const StepOutcome = z.enum([
  /** The design says what happens here. */
  "defined",
  /** The design is silent. */
  "undefined",
  /** Two parts of the design disagree. */
  "conflict",
  /** The design says what happens, and it is wrong or unsafe. */
  "failure",
]);

export const AgentReport = z.object({
  scenarios: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      roleId: z.string().nullable(),
      intent: z.string(),
      steps: z.array(
        z.object({
          action: z.string(),
          operationId: z.string().nullable(),
          outcome: StepOutcome,
          detail: z.string(),
          /** Ids of the model items or coverage gaps that decide this step. */
          refs: z.array(z.string()),
        }),
      ),
    }),
  ),
  findings: z.array(
    z.object({
      id: z.string(),
      type: FindingType,
      title: z.string(),
      description: z.string(),
      severity: Severity,
      /** The scenario steps that show it. `step` counts from 1. */
      evidence: z.array(
        z.object({ scenarioId: z.string(), step: z.number().int() }),
      ),
      refs: z.array(z.string()),
      suggestion: z.string(),
    }),
  ),
});
export type AgentReport = z.infer<typeof AgentReport>;
export type Scenario = AgentReport["scenarios"][number];
export type RawFinding = AgentReport["findings"][number];

/** How the application is put together: its parts and how they connect. */
export const Architecture = z.object({
  components: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum([
        "frontend",
        "service",
        "database",
        "queue",
        "external",
        "library",
        "other",
      ]),
      /** The workspace it lives in, or null for something outside the code. */
      workspace: z.string().nullable(),
      /** The folders or files that make it up, as paths from the root. */
      paths: z.array(z.string()),
      description: z.string(),
    }),
  ),
  connections: z.array(
    z.object({ from: z.string(), to: z.string(), label: z.string() }),
  ),
});
export type Architecture = z.infer<typeof Architecture>;

/** The model stage's answer in a repository run: the model and the architecture. */
export const RepoDesignModel = DesignModel.extend({
  architecture: Architecture,
});
export type RepoDesignModel = z.infer<typeof RepoDesignModel>;

/** What an agent returns at the end of a repository run. Its findings were
 * already filed one by one through a tool. */
export const RepoAgentSummary = z.object({ summary: z.string() });
export type RepoAgentSummary = z.infer<typeof RepoAgentSummary>;

// ── Stage 4: the challenge round ────────────────────────────────────────────

/** One agent's view of the findings the other agents reported. */
export const Challenges = z.object({
  challenges: z.array(
    z.object({
      findingId: z.string(),
      stance: z.enum(["support", "dispute"]),
      reason: z.string(),
    }),
  ),
});
export type Challenges = z.infer<typeof Challenges>;

// ── Stage 5: the judge ──────────────────────────────────────────────────────

export const Verdict = z.object({
  groups: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: FindingType,
      severity: Severity,
      summary: z.string(),
      /** The findings merged into this group, by their run-wide id. */
      findingIds: z.array(z.string()),
    }),
  ),
  rejected: z.array(z.object({ findingId: z.string(), reason: z.string() })),
});
export type Verdict = z.infer<typeof Verdict>;

// ── Stage 6: work orders ────────────────────────────────────────────────────

export const Priority = z.enum(["p0", "p1", "p2", "p3"]);

export const WorkOrders = z.object({
  workOrders: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      priority: Priority,
      description: z.string(),
      acceptanceCriteria: z.array(z.string()),
      /** The finding groups this work order settles. */
      groupIds: z.array(z.string()),
    }),
  ),
});
export type WorkOrders = z.infer<typeof WorkOrders>;
export type WorkOrder = z.infer<typeof WorkOrders>["workOrders"][number];

// ── What the engine stores ──────────────────────────────────────────────────

export const AgentId = z.enum(AGENT_IDS);
export type AgentId = z.infer<typeof AgentId>;

export const STAGES = [
  "survey",
  "model",
  "coverage",
  "agents",
  "challenge",
  "judge",
  "work_orders",
] as const;
export type Stage = (typeof STAGES)[number];

export type RunStatus = "running" | "completed" | "failed" | "interrupted";
export type AgentStatus =
  "pending" | "running" | "done" | "declined" | "failed";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type GapKind =
  | "permission_unspecified"
  | "condition_missing"
  | "failure_unspecified"
  | "limit_unspecified"
  | "operation_without_journey"
  | "role_without_journey";

/** A hole in the design that code can see without asking a model. */
export interface Gap {
  id: string;
  kind: GapKind;
  /** The model items the gap is about. */
  refs: string[];
  text: string;
}

export interface Coverage {
  gaps: Gap[];
  stats: {
    roles: number;
    operations: number;
    permissionCells: number;
    specifiedCells: number;
    assumedItems: number;
    statedItems: number;
  };
}

/** Where in a repository a finding points, with the code it cites. */
export interface CodeLocation {
  path: string;
  startLine: number;
  endLine: number;
  quote: string;
}

/** Where a repository run's code came from. */
export interface RunSource {
  kind: "repository";
  origin:
    | { kind: "github"; url: string; branch: string | null }
    | { kind: "local"; name: string };
  /** A short name for people: "owner/name" or the folder. */
  label: string;
  files: number | null;
  /** The most common file types, for example [".ts", ".go"]. */
  languages: string[];
  /**
   * Set in a project run: every repository read, by workspace name. Files
   * are then addressed as "workspace/path".
   */
  workspaces?: {
    name: string;
    origin: RunSource["origin"];
    label: string;
  }[];
  /** How the application is put together, as read from the code. */
  architecture?: Architecture;
}

/** A finding that passed the citation checks, with its run-wide id. */
export interface Finding extends RawFinding {
  /** Set in a repository run: the code that shows the flaw. */
  location?: CodeLocation;
  /** `<agentId>/<the agent's own id>`, unique in the run. */
  uid: string;
  agentId: AgentId;
}

export interface DroppedFinding {
  agentId: AgentId;
  title: string;
  reason: string;
}

export interface AgentRun {
  agentId: AgentId;
  status: AgentStatus;
  scenarios: Scenario[];
  findings: Finding[];
  dropped: DroppedFinding[];
  usage: Usage | null;
  /** The policy category, when the model declined this agent's work. */
  declinedCategory: string | null;
  error: string | null;
}

/** What one agent said about another agent's finding. */
export interface Challenge {
  agentId: AgentId;
  findingId: string;
  stance: "support" | "dispute";
  reason: string;
}

export interface FindingGroup {
  id: string;
  title: string;
  type: FindingType;
  severity: Severity;
  summary: string;
  findingIds: string[];
  /** False when the judge skipped these findings and code kept them. */
  reviewed: boolean;
}

export interface ScoreRow {
  agentId: AgentId;
  points: number;
  /** Findings that ended up in an accepted group. */
  accepted: number;
  rejected: number;
  /** Groups only this agent found. */
  unique: number;
  /** Disputes of other agents' findings that the judge agreed with. */
  upheld: number;
  scenarios: number;
}

export interface RunDocument {
  name: string;
  content: string;
}

export interface RunRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  stage: Stage | null;
  error: string | null;
  title: string;
  requirement: string;
  documents: RunDocument[];
  /** The project this run was started from, if any. */
  projectId?: string;
  /**
   * What the run read: the names of the project's workspaces, or the label
   * of the one repository. Absent on requirement runs.
   */
  workspaces?: string[];
  /** Set when the run reads a repository. Absent on requirement runs. */
  source?: RunSource;
  models: { reasoning: string; agents: string };
  /** True when the run replayed sample data and never called the model. */
  sample: boolean;
  designModel: DesignModel | null;
  modelWarnings: string[];
  coverage: Coverage | null;
  agents: AgentRun[];
  /** Absent on runs made before the challenge round existed. */
  challenges?: Challenge[];
  groups: FindingGroup[];
  rejected: { findingId: string; reason: string }[];
  workOrders: WorkOrder[];
  /** Accepted groups no work order covers. */
  unaddressedGroupIds: string[];
  scoreboard: ScoreRow[];
  usage: Partial<Record<Stage, Usage>>;
}

export interface RunSummary {
  id: string;
  projectId: string | null;
  createdAt: string;
  status: RunStatus;
  stage: Stage | null;
  title: string;
  findingCount: number;
  workOrderCount: number;
  /** What the run read. Empty for a requirement run. */
  workspaces: string[];
}

export type RunEvent =
  | { type: "run.started" }
  | { type: "stage.started"; stage: Stage }
  | { type: "stage.completed"; stage: Stage; summary: string }
  /** A workspace's code is on disk. Project runs only. */
  | { type: "workspace.ready"; name: string; label: string }
  /** The model stage has described how the application is put together. */
  | { type: "architecture.ready"; architecture: Architecture }
  | { type: "agent.started"; agentId: AgentId }
  | {
      type: "agent.progress";
      agentId: AgentId;
      scenarios: string[];
      findings: number;
    }
  | {
      type: "agent.completed";
      agentId: AgentId;
      scenarios: number;
      findings: number;
      dropped: number;
    }
  | { type: "agent.reading"; agentId: AgentId; path: string }
  | { type: "agent.finding"; agentId: AgentId; finding: LiveFinding }
  | { type: "agent.declined"; agentId: AgentId; category: string | null }
  | { type: "agent.failed"; agentId: AgentId; error: string }
  | { type: "run.completed" }
  | { type: "run.failed"; error: string };

/** A finding as it is shown the moment it is filed, before the judge rules. */
export interface LiveFinding {
  uid: string;
  type: FindingType;
  severity: Severity;
  title: string;
  path: string | null;
  startLine: number | null;
}

export interface StoredEvent {
  seq: number;
  at: string;
  event: RunEvent;
}

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}
