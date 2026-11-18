"use client";

import Link from "next/link";
import {
  ArrowRight,
  FolderPlus,
  GitMerge,
  GitPullRequest,
  Lightbulb,
  PencilLine,
  Play,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { PullRequestRefresher } from "@/components/issues/pr-refresher";
import { LocalTime } from "@/components/local-time";
import { Panel } from "@/components/panel";
import { SeverityBar } from "@/components/severity-bar";
import { DeleteProjectDialog } from "@/components/project/project-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomeNumbers } from "@/lib/viz/home";

/*
 * The projects board: one quiet list of projects (how bad, how far along,
 * what to do next, delete), then the latest pull requests. The totals are
 * chips in the page header.
 */

type Project = HomeNumbers["projects"][number];

const NEXT_ICON = {
  rescan: GitMerge,
  fix: ShieldAlert,
  run: Play,
  open: ArrowRight,
  refine: PencilLine,
} as const;

function SectionTitle({
  children,
  about,
  label,
  action,
}: {
  children: React.ReactNode;
  about: "projectsHealth" | "recentRuns" | "recentPrs";
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5">
      <h2 className="flex items-center gap-1.5 text-[0.8125rem] font-medium">
        {children}
        <InfoTip about={about} label={label} />
      </h2>
      {action}
    </div>
  );
}

/** Open issues by severity, or a quiet line when none is open. */
function Severity({ project }: { project: Project }) {
  if (project.open === 0) {
    return (
      <span className="text-xs text-muted-foreground">No open issues</span>
    );
  }
  return (
    <SeverityBar
      counts={project.bySeverity}
      label={`${project.name}: open issues by severity`}
    />
  );
}

/** What the board needs beyond the numbers: to tag and delete a project. */
export interface BoardMeta {
  demo: boolean;
  /** How many runs it has, for the delete dialog. */
  runs: number;
}

function ProjectRow({ project, meta }: { project: Project; meta?: BoardMeta }) {
  const Next = NEXT_ICON[project.next.kind];
  const urgent = project.next.kind !== "open" && project.next.kind !== "run";
  return (
    <li
      className="grid grid-cols-1 items-center gap-y-2 px-4 py-3 md:col-span-full md:grid-cols-subgrid"
      data-testid="home-project"
    >
      <div className="min-w-0">
        <Link
          href={`/app/projects/${project.id}`}
          className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline"
        >
          <span className="truncate">{project.name}</span>
          {meta?.demo ? (
            <Badge variant="secondary" className="shrink-0">
              Sample
            </Badge>
          ) : null}
        </Link>
        <p className="text-xs text-muted-foreground">
          {Math.round(project.fixedShare * 100)}% fixed · {project.fixed} of{" "}
          {project.fixed + project.open}
        </p>
        <p className="hidden text-xs text-muted-foreground md:block xl:hidden">
          {project.lastRun ? (
            <LocalTime iso={project.lastRun.at} />
          ) : (
            "Not run yet"
          )}
        </p>
      </div>

      <div className="min-w-0 space-y-1">
        <Severity project={project} />
        {project.risks > 0 && project.requirementRunId ? (
          <Link
            href={`/app/runs/${project.requirementRunId}`}
            className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="home-project-risks"
            title={`${project.risks} probable ${project.risks === 1 ? "risk" : "risks"} in the requirement`}
          >
            <Lightbulb className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {project.risks} probable {project.risks === 1 ? "risk" : "risks"}{" "}
              in the requirement
            </span>
          </Link>
        ) : null}
      </div>

      <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
        <GitPullRequest className="size-3.5" aria-hidden="true" />
        <span className="font-mono text-foreground tabular-nums">
          {project.prs}
        </span>
        open
        {project.merged > 0 ? (
          <span className="text-sev-high">· {project.merged} merged</span>
        ) : null}
      </span>

      <span className="text-xs whitespace-nowrap text-muted-foreground md:hidden xl:block">
        {project.lastRun ? (
          <LocalTime iso={project.lastRun.at} />
        ) : (
          "Not run yet"
        )}
      </span>

      <Link
        href={project.next.href}
        className={cn(
          buttonVariants({
            variant: urgent ? "secondary" : "ghost",
            size: "sm",
          }),
          "max-w-full justify-self-start md:justify-self-end",
          urgent && "text-foreground",
        )}
        data-testid="home-project-next"
      >
        <Next
          className={cn("size-3.5", urgent && "text-brand")}
          aria-hidden="true"
        />
        {project.next.label}
      </Link>

      <DeleteProjectDialog
        projectId={project.id}
        name={project.name}
        runs={meta?.runs ?? 0}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="justify-self-start text-muted-foreground md:justify-self-end"
          aria-label={`Delete ${project.name}`}
          data-testid="projects-row-delete"
        >
          <Trash2 />
        </Button>
      </DeleteProjectDialog>
    </li>
  );
}

export function ProjectsBoard({
  numbers,
  meta,
}: {
  numbers: HomeNumbers;
  meta: Record<string, BoardMeta>;
}) {
  return (
    <div className="space-y-5" data-testid="projects-board">
      <PullRequestRefresher />

      <Panel>
        <SectionTitle about="projectsHealth" label="Projects">
          Projects
        </SectionTitle>
        {numbers.projects.length === 0 ? (
          <Link
            href="/app/projects"
            className="flex items-center justify-center gap-2 px-4 py-10 text-[0.8125rem] text-muted-foreground hover:text-foreground"
          >
            <FolderPlus className="size-4" aria-hidden="true" />
            Add your first project
          </Link>
        ) : (
          // One grid for the whole list, each row on its subgrid, so every
          // column lines up from row to row.
          <ul className="divide-y md:grid md:grid-cols-[minmax(8rem,1fr)_minmax(11rem,1.4fr)_auto_auto_auto] md:gap-x-5 xl:grid-cols-[minmax(8rem,1fr)_minmax(12rem,1.4fr)_auto_auto_auto_auto]">
            <li
              aria-hidden="true"
              className="hidden px-4 py-2 text-xs text-muted-foreground md:col-span-full md:grid md:grid-cols-subgrid"
            >
              <span>Project</span>
              <span>Open issues</span>
              <span>Pull requests</span>
              <span className="hidden xl:block">Last run</span>
              <span className="justify-self-end">Next</span>
              <span />
            </li>
            {numbers.projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                meta={meta[project.id]}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel data-testid="home-prs">
        <SectionTitle about="recentPrs" label="Recent pull requests">
          Recent pull requests
        </SectionTitle>
        {numbers.recentPrs.length === 0 ? (
          <p className="px-4 py-6 text-[0.8125rem] text-muted-foreground">
            No fix pull requests yet. Open one from a security issue in a run.
          </p>
        ) : (
          <ul className="divide-y">
            {numbers.recentPrs.map((item) => (
              <li key={item.id}>
                <a
                  href={item.pr!.url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-[0.8125rem] hover:bg-muted/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    #{item.pr!.number}
                  </span>
                  <span className="truncate">{item.title}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {item.projectName} · {item.pr!.state}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
