import { KIND_LABEL } from "@/lib/labels";
import { sidebarRuns } from "@/lib/viz/sidebar";
import type { RunSummary } from "@/server/engine/schema";

/*
 * What one row of the runs list says, and the totals in the page header.
 * Pure: everything comes from the run summaries.
 */

export interface RunRow {
  /** The title, or "Code run" when it only repeats the project's name. */
  title: string;
  /** "Crosswind", "Fly-off", "Requirement"…, or null for a plain code run. */
  tag: string | null;
  /** A requirement run: its findings are probable risks. */
  probable: boolean;
  /** The first workspaces read, and how many more there are. */
  workspaces: { shown: string[]; more: number };
  /** The stage a running run is at ("Agents 4/8"); null otherwise. */
  step: string | null;
}

export const WORKSPACES_SHOWN = 2;

export function runRow(run: RunSummary, projectName?: string): RunRow {
  const probable = run.kind === "audit" && run.workspaces.length === 0;
  return {
    title:
      projectName !== undefined && run.title === projectName
        ? "Code run"
        : run.title,
    tag:
      run.kind !== "audit"
        ? KIND_LABEL[run.kind]
        : probable
          ? "Requirement"
          : null,
    probable,
    workspaces: {
      shown: run.workspaces.slice(0, WORKSPACES_SHOWN),
      more: Math.max(0, run.workspaces.length - WORKSPACES_SHOWN),
    },
    step:
      run.status === "running" ? (sidebarRuns([run])[0]?.step ?? null) : null,
  };
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
