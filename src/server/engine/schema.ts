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

// ── Preflight: a written spec, checked line by line against the code ──────

export const LINE_STATUSES = [
  "implemented",
  "partly",
  "missing",
  "contradicted",
  "unclear",
] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/** What a trace agent says when it has reported its lines. */
export const LineReport = z.object({ summary: z.string() });
export type LineReport = z.infer<typeof LineReport>;

export interface PreflightLine {
  id: string;
  /** The line, exactly as the spec words it. */
  text: string;
  /** The agent whose lens fits it, and who checks it. */
  agentId: AgentId;
  status: LineStatus;
  note: string;
  /** The code that shows it, checked; none for missing or unclear. */
  locations: CodeLocation[];
  /** For a missing line: where the agent looked. */
  searched: string | null;
}

export interface RunPreflight {
  lines: PreflightLine[];
}

// ── Dogfight: a fix that must hold against an attacker ────────────────────

/** What the attacker says after reading the fixed code. */
export const AttackAnswer = z.object({
  verdict: z.enum(["through", "held"]),
  /** The way through in a few words, or why the fix holds. */
  title: z.string(),
  /** How, in one or two sentences; or what was tried. */
  how: z.string(),
  /** For a way through: the lines of the fixed code that show it. */
  path: z.string().nullable(),
  startLine: z.number().int().nullable(),
  endLine: z.number().int().nullable(),
});
export type AttackAnswer = z.infer<typeof AttackAnswer>;

export interface DuelRound {
  n: number;
  defence: {
    summary: string;
    /** Edits of this round, against the code as the round before left it. */
    edits: RemediationRecord["edits"];
    /** The fix the earlier run wrote, or one written in this duel. */
    from: "run" | "written";
  };
  /** Null when the defender could write no fix this round. */
  attack: {
    verdict: "through" | "held";
    title: string;
    how: string;
    /** Checked against the fixed code. A way through must have one. */
    location: CodeLocation | null;
  } | null;
}

export interface RunDogfight {
  /** The issue under attack, as the earlier run accepted it. */
  target: {
    runId: string | null;
    groupId: string;
    title: string;
    summary: string;
    severity: Severity;
    location: CodeLocation | null;
  };
  maxRounds: number;
  rounds: DuelRound[];
  /** True when the last fix held; null until the duel ends. */
  held: boolean | null;
}

// ── Engine Out: one part cut on purpose, and what fails with it ───────────

/** How the part fails: gone (refused at once) or slow (answers late). */
export const OUTAGE_MODES = ["down", "slow"] as const;
export type OutageMode = (typeof OUTAGE_MODES)[number];

/** What the code at one hop does when the failure reaches it. */
export const HopBehaviour = z.enum([
  "hangs",
  "errors",
  "retries",
  "wrong_data",
  "silent",
  "holds",
]);
export type HopBehaviour = z.infer<typeof HopBehaviour>;

/** What a cut-stage agent says when it has filed its hops. */
export const HopReport = z.object({ summary: z.string() });
export type HopReport = z.infer<typeof HopReport>;

/** The judge's ordering of the hops, and what each journey comes to. */
export const CascadeAnswer = z.object({
  headline: z.string(),
  hops: z.array(
    z.object({
      id: z.string(),
      depth: z.number().int(),
      severity: Severity,
    }),
  ),
  journeys: z.array(
    z.object({
      name: z.string(),
      effect: z.string(),
      broken: z.boolean(),
    }),
  ),
});
export type CascadeAnswer = z.infer<typeof CascadeAnswer>;

/** One step of the failure, at the lines that decide it. */
export interface OutageHop {
  id: string;
  /** The part the failure comes from, nearer the cut. */
  from: string;
  /** The part whose code is cited: where this step happens. */
  to: string;
  behaviour: HopBehaviour;
  /** What happens, in one line. */
  effect: string;
  severity: Severity;
  /** Steps from the cut: 1 for a part that calls it. */
  depth: number;
  location: CodeLocation;
  /** The worker that filed it. */
  by: string;
}

export interface RunOutage {
  /** The part cut, as a component of the run's map. */
  part: { id: string; name: string };
  mode: OutageMode;
  /** Where the map came from: an earlier run's id, or drawn by this run. */
  mapFrom: string | null;
  headline: string;
  /** Ordered from the cut outward. */
  hops: OutageHop[];
  journeys: CascadeAnswer["journeys"];
}

// ── Flutter: accepted issues that add up to a breach ──────────────────────

/**
 * Attack chains: accepted issues, often in different services, that an
 * attacker uses one after another. Each link is an accepted group; the
 * step from one link to the next may cite the code that joins them.
 */
export const ChainAnswer = z.object({
  chains: z.array(
    z.object({
      title: z.string(),
      impact: z.string(),
      severity: Severity,
      links: z.array(
        z.object({
          groupId: z.string(),
          role: z.string(),
          via: z
            .object({
              how: z.string(),
              path: z.string(),
              startLine: z.number().int(),
              endLine: z.number().int(),
            })
            .nullable(),
        }),
      ),
    }),
  ),
});
export type ChainAnswer = z.infer<typeof ChainAnswer>;

/** A checked chain, as the run keeps it. */
export interface AttackChain {
  id: string;
  title: string;
  /** What an attacker ends up with. */
  impact: string;
  /** Never below the worst of its links. */
  severity: Severity;
  links: {
    groupId: string;
    /** What this issue does in the chain. */
    role: string;
    /** The code that leads here from the link before, checked. */
    via: (CodeLocation & { how: string }) | null;
  }[];
}

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
  "change",
  "survey",
  "triage",
  "model",
  "coverage",
  "agents",
  "proposals",
  "critique",
  "challenge",
  "judge",
  "chains",
  "remediation",
  "impact",
  "work_orders",
  "map",
  "cut",
  "cascade",
  "duel",
  "verdict",
  "split",
  "trace",
] as const;
export type Stage = (typeof STAGES)[number];

/**
 * What a run is for. An audit tests a requirement or a project's code (the
 * original run). Crosswind traces one change through every service. A
 * fly-off has rival agents design a requirement and a judge pick one. A
 * black box takes production feedback to its cause and a fix.
 */
export const RUN_KINDS = [
  "audit",
  "crosswind",
  "flyoff",
  "blackbox",
  "engineout",
  "dogfight",
  "preflight",
] as const;
export type RunKind = (typeof RUN_KINDS)[number];

/** Each kind's stages, in order. An audit of a requirement has no survey. */
export const STAGES_OF: Record<RunKind, readonly Stage[]> = {
  audit: [
    "survey",
    "model",
    "coverage",
    "agents",
    "challenge",
    "judge",
    "chains",
    "remediation",
    "work_orders",
  ],
  crosswind: [
    "change",
    "survey",
    "model",
    "coverage",
    "agents",
    "challenge",
    "judge",
    "impact",
    "work_orders",
  ],
  flyoff: ["model", "proposals", "critique", "judge"],
  blackbox: ["survey", "triage", "remediation", "duel"],
  engineout: ["survey", "map", "cut", "cascade"],
  dogfight: ["survey", "duel", "verdict"],
  preflight: ["survey", "split", "trace"],
};

/** A run's kind; runs made before kinds existed are audits. */
export const kindOf = (run: { kind?: RunKind | null }): RunKind =>
  run.kind ?? "audit";

/** The stages a run goes through, in order. */
export function stagesOf(run: {
  kind?: RunKind | null;
  source?: unknown;
}): Stage[] {
  const all = STAGES_OF[kindOf(run)];
  // A run that read no code has nothing to survey, and no lines to chain.
  return all.filter(
    (stage) =>
      (stage !== "survey" && stage !== "chains") || Boolean(run.source),
  );
}

// ── Crosswind: one change, traced through every service ──────────────────

/** What changes: a pull request, two branches, or a change in words. */
export type ChangeInput =
  | { kind: "pr"; workspace: string; number: number }
  | { kind: "branches"; workspace: string; base: string; head: string }
  | { kind: "text"; text: string };

export interface ChangedFile {
  /** From the root the agents read (workspace/path in a project). */
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  /** The unified diff of this file, cut short when it is long. */
  patch: string | null;
  previousPath: string | null;
}

export interface RunChange {
  input: ChangeInput;
  title: string;
  /** The pull request or comparison on GitHub, when there is one. */
  url: string | null;
  base: string | null;
  head: string | null;
  files: ChangedFile[];
  /** True when files or patches were left out to keep the run in bounds. */
  truncated: boolean;
}

export type ImpactEffect = "added" | "removed" | "changed" | "affected";

export interface RunImpact {
  summary: string;
  components: {
    id: string;
    name: string;
    effect: ImpactEffect;
    note: string;
  }[];
  connections: {
    from: string;
    to: string;
    label: string;
    effect: "added" | "removed";
  }[];
  before: Architecture | null;
  after: Architecture | null;
  /** Known issues of the project this change would fix. */
  fixes: { issueId: string; title: string; reason: string }[];
  /** A short review of the change, ready to post on its pull request. */
  review: string;
}

/** The model's part of the impact: a summary, a review and what it fixes. */
export const ImpactAnswer = z.object({
  summary: z.string(),
  review: z.string(),
  fixes: z.array(z.object({ issueId: z.string(), reason: z.string() })),
});
export type ImpactAnswer = z.infer<typeof ImpactAnswer>;

// ── Fly-off: rival designs, one judge ─────────────────────────────────────

export const Blueprint = z.object({
  name: z.string(),
  summary: z.string(),
  components: z.array(
    z.object({ name: z.string(), kind: z.string(), description: z.string() }),
  ),
  connections: z.array(
    z.object({ from: z.string(), to: z.string(), label: z.string() }),
  ),
  decisions: z.array(
    z.object({
      decision: z.string(),
      why: z.string(),
      tradeoff: z.string(),
    }),
  ),
  risks: z.array(z.string()),
});
export type Blueprint = z.infer<typeof Blueprint>;

export const Critique = z.object({
  critiques: z.array(
    z.object({
      blueprintId: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.object({ point: z.string(), severity: Severity })),
    }),
  ),
});
export type Critique = z.infer<typeof Critique>;

export const FlyoffVerdict = z.object({
  winnerId: z.string(),
  summary: z.string(),
  ranking: z.array(
    z.object({
      blueprintId: z.string(),
      rank: z.number().int(),
      reason: z.string(),
    }),
  ),
  nextSteps: z.array(z.string()),
});
export type FlyoffVerdict = z.infer<typeof FlyoffVerdict>;

export interface RunFlyoff {
  blueprints: {
    id: string;
    proposer: string;
    angle: string;
    status: "pending" | "running" | "done" | "failed";
    blueprint: Blueprint | null;
    error: string | null;
  }[];
  critiques: {
    from: string;
    blueprintId: string;
    strengths: string[];
    weaknesses: { point: string; severity: Severity }[];
  }[];
  verdict: FlyoffVerdict | null;
}

// ── Black box: production feedback to its cause ───────────────────────────

export const TriageAnswer = z.object({
  title: z.string(),
  hypothesis: z.string(),
  type: FindingType,
  severity: Severity,
  confidence: z.enum(["high", "medium", "low"]),
  /** Which part of the product or requirement it touches, in plain words. */
  affects: z.string(),
  suspects: z.array(
    z.object({
      path: z.string(),
      startLine: z.number().int(),
      endLine: z.number().int(),
      why: z.string(),
    }),
  ),
  checks: z.array(z.string()),
});
export type TriageAnswer = z.infer<typeof TriageAnswer>;

export interface RunTriage extends Omit<TriageAnswer, "suspects"> {
  /** Only suspects whose lines exist, with the code they cite. */
  suspects: (CodeLocation & { why: string })[];
}

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
  /**
   * Set when the flaw was found by code, not by an agent (a secret written
   * into the source): where it is. Its quote never holds the secret.
   */
  location?: CodeLocation;
  foundBy?: "code";
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
  /** The requirement run this one refines (its previous version). */
  parentRunId?: string;
  /** What the run is for. Absent on runs made before kinds: an audit. */
  kind?: RunKind;
  /** A code run's requirement run: the idea this code implements. */
  requirementRunId?: string;
  /** Crosswind: the change, and what it does across the services. */
  change?: RunChange;
  impact?: RunImpact;
  /** Fly-off: the blueprints, the critiques and the verdict. */
  flyoff?: RunFlyoff;
  /** Black box: the production feedback, and where it leads. */
  incident?: string;
  triage?: RunTriage;
  /** What the run cost, in US dollars, from its token use. */
  costUsd?: number;
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
  /** Security findings' remediations, by group id. Absent on older runs. */
  remediations?: Record<string, RemediationRecord>;
  /** Engine Out: the part cut and the failure that spread from it. */
  outage?: RunOutage;
  /** Dogfight, or a Black Box's fix put to an attacker: every round. */
  dogfight?: RunDogfight;
  /** Preflight: the spec, line by line, against the code. */
  preflight?: RunPreflight;
  /** Flutter: accepted issues that add up to a breach. Code runs only. */
  chains?: AttackChain[];
  /** Chains the model gave that failed a check, and were left out. */
  chainsDropped?: number;
  /** Personal data and secrets in the code, found by name. Code runs only. */
  inventory?: Inventory;
}

export interface RunSummary {
  id: string;
  projectId: string | null;
  kind: RunKind;
  /** The requirement run this one refines, if any. */
  parentRunId: string | null;
  createdAt: string;
  status: RunStatus;
  stage: Stage | null;
  title: string;
  findingCount: number;
  workOrderCount: number;
  /** What the run read. Empty for a requirement run. */
  workspaces: string[];
  /** What it cost in US dollars, once finished; null before or unknown. */
  costUsd: number | null;
  /** Accepted findings by severity, once finished. */
  counts: Record<Severity, number> | null;
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
  /**
   * The workers of the newer kinds, by their id in lib/features.ts: a
   * fly-off's designers and judge, a black box's investigator and fixer.
   * `doing` says what it is on; `note` what it came to.
   */
  | { type: "actor.started"; actorId: string; doing: string }
  | { type: "actor.reading"; actorId: string; path: string }
  | { type: "actor.completed"; actorId: string; note: string }
  | { type: "actor.failed"; actorId: string; error: string }
  /** A security finding's remediation is ready (or could not be made). */
  | { type: "remediation.ready"; groupId: string }
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

// ── Security: remediation and the data inventory ────────────────────────────

/** The remediation stage's answer for one security finding. */
export const RemediationAnswer = z.object({
  summary: z.string(),
  steps: z.array(z.string()),
  /** For example "CWE-89". */
  cwe: z.string(),
  /** For example "A03:2021 Injection". */
  owasp: z.string(),
  /** Each replaces lines of one file. The "before" text must be exact. */
  edits: z.array(
    z.object({
      path: z.string(),
      startLine: z.number().int(),
      endLine: z.number().int(),
      before: z.string(),
      after: z.string(),
    }),
  ),
  notes: z.array(z.string()),
});
export type RemediationAnswer = z.infer<typeof RemediationAnswer>;

export interface RemediationRecord {
  groupId: string;
  /** "made", or "failed" when there is no remediation and why is in error. */
  status: "made" | "failed";
  summary: string;
  steps: string[];
  cwe: { id: string; name: string; url: string; fallback: boolean } | null;
  owasp: { id: string; name: string; url: string } | null;
  /** Edits that matched the real file, with context for a diff. */
  edits: {
    path: string;
    startLine: number;
    before: string[];
    after: string[];
    contextBefore: string[];
    contextAfter: string[];
    noNewlineAtEnd?: boolean;
  }[];
  /** Edits that were not kept, and why. */
  dropped: { path: string; reason: string }[];
  notes: string[];
  error: string | null;
  /** Set when an attacker found no way past this fix, after this many rounds. */
  heldRounds?: number;
}

export type PiiCategory =
  | "contact"
  | "identity"
  | "financial"
  | "location"
  | "health"
  | "credentials"
  | "online";

export type DataSink = "log" | "outside" | "storage" | "response";

export interface Inventory {
  /** Each place a name that holds personal data appears, by file and line. */
  pii: {
    category: PiiCategory;
    term: string;
    path: string;
    line: number;
    sinks: DataSink[];
  }[];
  /** Secrets written into the code: their kind and place, never the value. */
  secrets: { kind: string; path: string; line: number; masked: string }[];
  filesScanned: number;
  /** True when the scan stopped at its limit before reading every file. */
  truncated: boolean;
}
