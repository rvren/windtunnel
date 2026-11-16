import type { RunSummary, Severity } from "@/server/engine/schema";

/*
 * The project page's trend: open issues by severity over the project's
 * finished audits. Pure; the page reads the runs and fills in counts that
 * older runs did not store.
 */

export const TREND_LIMIT = 24;

export interface TrendPoint {
  runId: string;
  createdAt: string;
  counts: Record<Severity, number>;
  total: number;
}

/**
 * The runs the trend draws, oldest first: finished audits that read code
 * (or, for a project with no code run yet, finished requirement audits),
 * the latest `limit` of them. `runs` comes newest first, as the store
 * lists them.
 */
export function trendRuns(
  runs: RunSummary[],
  code: boolean,
  limit = TREND_LIMIT,
): RunSummary[] {
  return runs
    .filter(
      (run) =>
        run.status === "completed" &&
        run.kind === "audit" &&
        run.workspaces.length > 0 === code,
    )
    .slice(0, limit)
    .reverse();
}

export function trendPoint(
  run: Pick<RunSummary, "id" | "createdAt">,
  counts: Record<Severity, number>,
): TrendPoint {
  return {
    runId: run.id,
    createdAt: run.createdAt,
    counts,
    total: counts.critical + counts.high + counts.medium + counts.low,
  };
}

/** A round top for the y axis, and the ticks under it (at most 4). */
export function trendScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const rough = max / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10].map((item) => item * power).find((item) => item >= rough) ??
    10 * power;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
}
