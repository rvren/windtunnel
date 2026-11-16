import { SEVERITY_LABEL, SEVERITY_ORDER, STAGE_LABEL } from "@/lib/labels";
import type { HomeNumbers } from "@/lib/viz/home";
import {
  STAGES_OF,
  type RunSummary,
  type Severity,
} from "@/server/engine/schema";

/*
 * What the side navigation lists under its menu: the projects, each with
 * its open issues, and the runs in progress with the stage they are at.
 * Pure; counts come from tracked issues and the runs table.
 */

export const SIDEBAR_PROJECTS = 6;

export interface SidebarProject {
  id: string;
  name: string;
  open: number;
  fixed: number;
  /** The most severe open issue, or null when none is open. */
  worst: Severity | null;
  /** One grey line under the name. */
  note: string;
}

export interface SidebarRun {
  id: string;
  title: string;
  /** "Agents 4/8", or "Starting". */
  step: string;
}

export function sidebarProjects(
  numbers: HomeNumbers,
  limit = SIDEBAR_PROJECTS,
): SidebarProject[] {
  return [...numbers.projects]
    .sort((a, b) => (b.lastRun?.at ?? "").localeCompare(a.lastRun?.at ?? ""))
    .slice(0, limit)
    .map((project) => {
      const worst =
        SEVERITY_ORDER.find((severity) => project.bySeverity[severity] > 0) ??
        null;
      return {
        id: project.id,
        name: project.name,
        open: project.open,
        fixed: project.fixed,
        worst,
        note: !project.lastRun
          ? "No run yet"
          : worst
            ? `${project.bySeverity[worst]} ${SEVERITY_LABEL[worst].toLowerCase()} open`
            : project.risks > 0
              ? `${project.risks} probable ${project.risks === 1 ? "risk" : "risks"}`
              : "Nothing open",
      };
    });
}

export function sidebarRuns(runs: RunSummary[]): SidebarRun[] {
  return runs
    .filter((run) => run.status === "running")
    .map((run) => {
      const stages = STAGES_OF[run.kind ?? "audit"];
      const at = run.stage ? stages.indexOf(run.stage) : -1;
      return {
        id: run.id,
        title: run.title,
        step:
          at >= 0
            ? `${STAGE_LABEL[stages[at]]} ${at + 1}/${stages.length}`
            : "Starting",
      };
    });
}
