import { SEVERITY_ORDER } from "@/lib/labels";
import type { RunSummary, Severity } from "@/server/engine/schema";
import type { Issue } from "@/server/issues/store";

/*
 * The home page's numbers, across every project, from tracked issues, runs
 * and pull requests. Pure; nothing estimated.
 */

const OPEN = new Set(["open", "reopened"]);
const LIVE = new Set(["open", "reopened", "pr_open", "merged"]);
const DAY = 24 * 60 * 60 * 1000;

export interface HomeProject {
  id: string;
  name: string;
}

export function homeNumbers(input: {
  projects: HomeProject[];
  issues: Issue[];
  runs: RunSummary[];
  now: number;
}) {
  const { projects, issues, runs, now } = input;
  const name = new Map(projects.map((item) => [item.id, item.name]));
  const live = issues.filter((issue) => LIVE.has(issue.state));

  // What needs a person.
  const merged = issues.filter((issue) => issue.state === "merged");
  const awaitingRescan = projects
    .map((project) => ({
      projectId: project.id,
      name: project.name,
      count: merged.filter((issue) => issue.projectId === project.id).length,
    }))
    .filter((item) => item.count > 0);
  const prsOpen = issues
    .filter((issue) => issue.state === "pr_open" && issue.pr)
    .map((issue) => ({
      ...issue,
      projectName: name.get(issue.projectId) ?? "",
    }));
  const unfixedSerious = issues
    .filter(
      (issue) =>
        OPEN.has(issue.state) &&
        (issue.severity === "critical" || issue.severity === "high"),
    )
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) -
          SEVERITY_ORDER.indexOf(b.severity) ||
        a.openedAt.localeCompare(b.openedAt),
    )
    .map((issue) => ({
      ...issue,
      projectName: name.get(issue.projectId) ?? "",
    }));

  // Open issues, by severity.
  const bySeverity = Object.fromEntries(
    SEVERITY_ORDER.map((severity) => [
      severity,
      live.filter((issue) => issue.severity === severity).length,
    ]),
  ) as Record<Severity, number>;

  // Opened and fixed per week, the last eight weeks (oldest first).
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const end = now - (7 - index) * 7 * DAY;
    const start = end - 7 * DAY;
    const inWeek = (iso: string | null) => {
      if (!iso) return false;
      const at = Date.parse(iso);
      return at > start && at <= end;
    };
    return {
      end,
      opened: issues.filter((issue) => inWeek(issue.openedAt)).length,
      fixed: issues.filter((issue) => inWeek(issue.fixedAt)).length,
    };
  });

  // The pipeline: where every live or fixed issue is now.
  const pipeline = {
    open: issues.filter((issue) => OPEN.has(issue.state)).length,
    prOpen: issues.filter((issue) => issue.state === "pr_open").length,
    merged: merged.length,
    fixed: issues.filter((issue) => issue.state === "fixed").length,
  };

  // Time to fix: first seen to confirmed gone.
  const days = issues
    .filter((issue) => issue.state === "fixed" && issue.fixedAt)
    .map(
      (issue) =>
        (Date.parse(issue.fixedAt!) - Date.parse(issue.openedAt)) / DAY,
    )
    .sort((a, b) => a - b);
  const median =
    days.length === 0
      ? null
      : days.length % 2
        ? days[(days.length - 1) / 2]
        : (days[days.length / 2 - 1] + days[days.length / 2]) / 2;
  const oldestCritical =
    issues
      .filter((issue) => OPEN.has(issue.state) && issue.severity === "critical")
      .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
      .map((issue) => ({
        ...issue,
        projectName: name.get(issue.projectId) ?? "",
        days: (now - Date.parse(issue.openedAt)) / DAY,
      }))[0] ?? null;

  // Each project at a glance.
  const perProject = projects.map((project) => {
    const own = live.filter((issue) => issue.projectId === project.id);
    const last = runs
      .filter((run) => run.projectId === project.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      id: project.id,
      name: project.name,
      critical: own.filter((issue) => issue.severity === "critical").length,
      high: own.filter((issue) => issue.severity === "high").length,
      open: own.length,
      prs: own.filter((issue) => issue.state === "pr_open").length,
      lastRun: last
        ? { id: last.id, at: last.createdAt, status: last.status }
        : null,
    };
  });

  const recentPrs = issues
    .filter((issue) => issue.pr)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((issue) => ({
      ...issue,
      projectName: name.get(issue.projectId) ?? "",
    }));

  return {
    needs: {
      awaitingRescan,
      prsOpen,
      unfixedSerious: unfixedSerious.slice(0, 5),
    },
    open: { total: live.length, bySeverity, weeks },
    pipeline,
    timeToFix: { medianDays: median, fixed: days.length, oldestCritical },
    projects: perProject,
    recentRuns: [...runs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    recentPrs,
  };
}

export type HomeNumbers = ReturnType<typeof homeNumbers>;
