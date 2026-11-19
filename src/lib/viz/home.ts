import { SEVERITY_ORDER } from "@/lib/labels";
import type { RunSummary, Severity } from "@/server/engine/schema";
import type { Issue } from "@/server/issues/store";

/*
 * The home page's numbers, across every project, from tracked issues, runs
 * and pull requests. Pure; nothing estimated.
 *
 * Health counts only issues found in code. A requirement run's issues are
 * probable risks of an idea: they cannot be fixed or merged, so they are
 * counted on their own line.
 */

const OPEN = new Set(["open", "reopened"]);
const LIVE = new Set(["open", "reopened", "pr_open", "merged"]);

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

  // Each project at a glance, with the one thing to do next.
  const perProject = projects.map((project) => {
    const all = issues.filter((issue) => issue.projectId === project.id);
    const mine = all.filter((issue) => issue.origin !== "requirement");
    const risks = all.filter(
      (issue) => issue.origin === "requirement" && OPEN.has(issue.state),
    ).length;
    const own = mine.filter((issue) => LIVE.has(issue.state));
    const fixedCount = mine.filter((issue) => issue.state === "fixed").length;
    const mergedCount = mine.filter((issue) => issue.state === "merged").length;
    const unfixed = mine.filter(
      (issue) =>
        OPEN.has(issue.state) &&
        issue.kind === "security_vulnerability" &&
        (issue.severity === "critical" || issue.severity === "high"),
    ).length;
    const theirs = runs
      .filter((run) => run.projectId === project.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const last = theirs[0];
    const lastCode = theirs.find((run) => run.workspaces.length > 0);
    const lastRequirement = theirs.find(
      (run) => run.workspaces.length === 0 && run.status === "completed",
    );
    const next: {
      kind: "rescan" | "fix" | "run" | "open" | "refine";
      label: string;
      href: string;
    } =
      mergedCount > 0
        ? {
            kind: "rescan",
            label: `Rescan To Confirm ${mergedCount} ${mergedCount === 1 ? "Fix" : "Fixes"}`,
            href: `/app/projects/${project.id}`,
          }
        : unfixed > 0
          ? {
              kind: "fix",
              label: `Fix ${unfixed} Serious Security ${unfixed === 1 ? "Issue" : "Issues"}`,
              href: `/app/projects/${project.id}`,
            }
          : !lastCode && risks > 0 && lastRequirement
            ? {
                kind: "refine",
                label: "Refine The Requirement",
                href: `/app/runs/${lastRequirement.id}`,
              }
            : !last
              ? {
                  kind: "run",
                  label: "Run The Project",
                  href: `/app/projects/${project.id}`,
                }
              : {
                  kind: "open",
                  label: "Open The Cockpit",
                  href: `/app/projects/${project.id}`,
                };
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
      /** Probable risks from requirement runs, still raised. */
      risks,
      /** The latest finished requirement run, where the risks are. */
      requirementRunId: lastRequirement?.id ?? null,
      next,
    };
  });

  // Every fix pull request, newest first: the board shows them a page at a
  // time.
  const recentPrs = issues
    .filter((issue) => issue.pr)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((issue) => ({
      ...issue,
      projectName: name.get(issue.projectId) ?? "",
    }));

  return {
    projects: perProject,
    recentRuns: [...runs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    recentPrs,
  };
}

export type HomeNumbers = ReturnType<typeof homeNumbers>;
