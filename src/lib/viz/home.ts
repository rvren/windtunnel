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
}) {
  const { projects, issues, runs } = input;
  const name = new Map(projects.map((item) => [item.id, item.name]));

  // The pipeline: where every live or fixed issue is now.
  const pipeline = {
    open: issues.filter((issue) => OPEN.has(issue.state)).length,
    prOpen: issues.filter((issue) => issue.state === "pr_open").length,
    merged: issues.filter((issue) => issue.state === "merged").length,
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
  // Each project at a glance, with the one thing to do next.
  const perProject = projects.map((project) => {
    const mine = issues.filter((issue) => issue.projectId === project.id);
    const own = mine.filter((issue) => LIVE.has(issue.state));
    const fixedCount = mine.filter((issue) => issue.state === "fixed").length;
    const mergedCount = mine.filter((issue) => issue.state === "merged").length;
    const unfixed = mine.filter(
      (issue) =>
        OPEN.has(issue.state) &&
        issue.kind === "security_vulnerability" &&
        (issue.severity === "critical" || issue.severity === "high"),
    ).length;
    const last = runs
      .filter((run) => run.projectId === project.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const next: { kind: "rescan" | "fix" | "run" | "open"; label: string } =
      mergedCount > 0
        ? {
            kind: "rescan",
            label: `Rescan to confirm ${mergedCount} ${mergedCount === 1 ? "fix" : "fixes"}`,
          }
        : unfixed > 0
          ? {
              kind: "fix",
              label: `Fix ${unfixed} serious security ${unfixed === 1 ? "issue" : "issues"}`,
            }
          : !last
            ? { kind: "run", label: "Run the project" }
            : { kind: "open", label: "Open the cockpit" };
    return {
      id: project.id,
      name: project.name,
      bySeverity: Object.fromEntries(
        SEVERITY_ORDER.map((severity) => [
          severity,
          own.filter((issue) => issue.severity === severity).length,
        ]),
      ) as Record<Severity, number>,
      open: own.length,
      prs: own.filter((issue) => issue.state === "pr_open").length,
      merged: mergedCount,
      fixed: fixedCount,
      /** Share of the project's issues confirmed fixed, 0 to 1. */
      fixedShare:
        fixedCount + own.length > 0
          ? fixedCount / (fixedCount + own.length)
          : 0,
      lastRun: last
        ? { id: last.id, at: last.createdAt, status: last.status }
        : null,
      next,
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
    pipeline,
    timeToFix: { medianDays: median, fixed: days.length },
    projects: perProject,
    recentRuns: [...runs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    recentPrs,
  };
}

export type HomeNumbers = ReturnType<typeof homeNumbers>;
