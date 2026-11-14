import { agentById, type AgentId } from "@/lib/agents";
import type { RunRecord, RunSummary } from "@/server/engine/schema";

/*
 * The right column of a finished run: how fully the design is stated, what
 * changed since the project's previous run, the agents, and delivery.
 * Pure; plain ratios and counts, no invented weighting.
 */

export interface Ratio {
  label: string;
  value: number;
  total: number;
  /** One line under the bar, e.g. "84 of 132 cells". */
  note: string;
}

/**
 * How fully the design states its rules. The headline is the share of
 * permission cells (role × operation) the design says something about.
 */
export function designSpecified(run: RunRecord): {
  score: number;
  parts: Ratio[];
} | null {
  const coverage = run.coverage;
  const model = run.designModel;
  if (!coverage || !model) return null;
  const { permissionCells, specifiedCells, statedItems, assumedItems } =
    coverage.stats;
  const inJourney = new Set(
    model.journeys.flatMap((journey) => journey.operationIds),
  );
  const operations = model.operations.length;
  const covered = model.operations.filter((op) => inJourney.has(op.id)).length;
  const parts: Ratio[] = [
    {
      label: "Permissions",
      value: specifiedCells,
      total: permissionCells,
      note: `${specifiedCells} of ${permissionCells} cells`,
    },
    {
      label: "Stated",
      value: statedItems,
      total: statedItems + assumedItems,
      note: `${assumedItems} assumed by the model`,
    },
    {
      label: "In a journey",
      value: covered,
      total: operations,
      note: `${covered} of ${operations} operations`,
    },
  ];
  return {
    score: permissionCells
      ? Math.round((specifiedCells / permissionCells) * 100)
      : 0,
    parts,
  };
}

export interface Change {
  label: string;
  now: number;
  before: number;
  /** True when going up is good. */
  upIsGood: boolean;
}

/** This run against the project's previous finished run. */
export function whatChanged(
  run: RunRecord,
  previous: RunSummary | null,
  previousSeverity: { critical: number; high: number } | null,
): Change[] {
  if (!previous) return [];
  const count = (severity: "critical" | "high") =>
    run.groups.filter((group) => group.severity === severity).length;
  return [
    {
      label: "Issues",
      now: run.groups.length,
      before: previous.findingCount,
      upIsGood: false,
    },
    ...(previousSeverity
      ? [
          {
            label: "Critical",
            now: count("critical"),
            before: previousSeverity.critical,
            upIsGood: false,
          },
          {
            label: "High",
            now: count("high"),
            before: previousSeverity.high,
            upIsGood: false,
          },
        ]
      : []),
    {
      label: "Work orders",
      now: run.workOrders.length,
      before: previous.workOrderCount,
      upIsGood: false,
    },
  ];
}

/** The agents, best scoring first: what each filed, what was kept. */
export function agentStandings(run: RunRecord) {
  return [...run.scoreboard]
    .sort((a, b) => b.points - a.points)
    .map((row) => ({
      id: row.agentId as AgentId,
      name: agentById(row.agentId)?.name ?? row.agentId,
      points: Math.round(row.points * 10) / 10,
      accepted: row.accepted,
      rejected: row.rejected,
    }));
}
