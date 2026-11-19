import { FEATURES, plainTitle } from "@/lib/features";
import { KIND_LABEL } from "@/lib/labels";
import { sidebarRuns } from "@/lib/viz/sidebar";
import type { RunKind, RunSummary } from "@/server/engine/schema";

/*
 * What one row of the runs list says, the totals in the page header, and
 * the kinds to filter by. Pure: everything comes from the run summaries.
 */

export interface RunRow {
  /** The title without the kind in front, or "Code run" when it only repeats the project's name. */
  title: string;
  /** The kind of run, always shown, and what it ran on for a Tunnel Run. */
  kind: { id: RunKind; label: string; detail: string | null };
  /** A requirement run: its findings are probable risks. */
  probable: boolean;
  /** The first workspaces read, and how many more there are. */
  workspaces: { shown: string[]; more: number };
  /** The stage a running run is at ("Agents 4/8"); null otherwise. */
  step: string | null;
  /**
   * How the result column reads: the severity bar of what it found, the
   * issue a Dogfight defended, or a Fly-off's pick, which is not a finding.
   */
  result: "findings" | "defended" | "picked";
}

export const WORKSPACES_SHOWN = 2;

export function runRow(run: RunSummary, projectName?: string): RunRow {
  const probable = run.kind === "audit" && run.workspaces.length === 0;
  const title = plainTitle(run.title);
  return {
    // A code Tunnel Run is titled after its project, which the row shows
    // under the title already.
    title:
      run.kind === "audit" && projectName !== undefined && title === projectName
        ? "Code run"
        : title,
    kind: {
      id: run.kind,
      label: KIND_LABEL[run.kind],
      detail: run.kind === "audit" ? (probable ? "An idea" : "Code") : null,
    },
    probable,
    workspaces: {
      shown: run.workspaces.slice(0, WORKSPACES_SHOWN),
      more: Math.max(0, run.workspaces.length - WORKSPACES_SHOWN),
    },
    step:
      run.status === "running" ? (sidebarRuns([run])[0]?.step ?? null) : null,
    result:
      run.kind === "dogfight"
        ? "defended"
        : run.kind === "flyoff"
          ? "picked"
          : "findings",
  };
}

/** The kinds among these runs, in the launcher's order, with their counts. */
export function kindCounts(
  runs: RunSummary[],
): { kind: RunKind; label: string; count: number }[] {
  return FEATURES.map((feature) => ({
    kind: feature.kind,
    label: feature.name,
    count: runs.filter((run) => run.kind === feature.kind).length,
  })).filter((item) => item.count > 0);
}

export interface RunsTotals {
  runs: number;
  running: number;
  /** What the listed runs cost, in US dollars; runs with no cost add 0. */
  spent: number;
  findings: number;
}

export function runsTotals(runs: RunSummary[]): RunsTotals {
  return {
    runs: runs.length,
    running: runs.filter((run) => run.status === "running").length,
    spent:
      Math.round(runs.reduce((sum, run) => sum + (run.costUsd ?? 0), 0) * 100) /
      100,
    findings: runs.reduce((sum, run) => sum + run.findingCount, 0),
  };
}
