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
} from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { PullRequestRefresher } from "@/components/issues/pr-refresher";
import { LocalTime } from "@/components/local-time";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/run/badges";
import { buttonVariants } from "@/components/ui/button";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { HomeNumbers } from "@/lib/viz/home";

/*
 * The home overview: one quiet list of projects (how bad, how far along,
 * what to do next), then the latest runs and pull requests. The totals are
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
      <h2 className="flex items-center gap-1.5 text-[13px] font-medium">
        {children}
        <InfoTip about={about} label={label} />
      </h2>
      {action}
    </div>
  );
}

/** A thin bar of open issues by severity, with the counts beside it. */
function Severity({ project }: { project: Project }) {
  if (project.open === 0) {
    return (
      <span className="text-xs text-muted-foreground">No open issues</span>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]"
        role="img"
        aria-label={`${project.name}: open issues by severity`}
      >
        {SEVERITY_ORDER.map((severity) =>
          project.bySeverity[severity] > 0 ? (
            <span
              key={severity}
              style={{
                flexGrow: project.bySeverity[severity],
                background: SEVERITY_TONE[severity],
              }}
            />
          ) : null,
        )}
      </div>
      <span className="flex gap-2.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
        {SEVERITY_ORDER.filter((s) => project.bySeverity[s] > 0).map((s) => (
          <span key={s} title={SEVERITY_LABEL[s]}>
            <span style={{ color: SEVERITY_TONE[s] }}>●</span>{" "}
            {project.bySeverity[s]}
          </span>
        ))}
      </span>
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
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
          className="block truncate text-sm font-medium hover:underline"
        >
          {project.name}
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
    </li>
  );
}

export function Home({ numbers }: { numbers: HomeNumbers }) {
  return (
    <div className="space-y-5" data-testid="home">
      <PullRequestRefresher />

      <Panel>
        <SectionTitle
          about="projectsHealth"
          label="Projects"
          action={
            <Link
              href="/app/projects"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Manage Projects
            </Link>
          }
        >
          Projects
        </SectionTitle>
        {numbers.projects.length === 0 ? (
          <Link
            href="/app/projects"
            className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <FolderPlus className="size-4" aria-hidden="true" />
            Add your first project
          </Link>
        ) : (
          // One grid for the whole list, each row on its subgrid, so every
          // column lines up from row to row.
          <ul className="divide-y md:grid md:grid-cols-[minmax(8rem,1fr)_minmax(11rem,1.4fr)_auto_auto] md:gap-x-5 xl:grid-cols-[minmax(8rem,1fr)_minmax(12rem,1.4fr)_auto_auto_auto]">
            <li
              aria-hidden="true"
              className="hidden px-4 py-2 text-xs text-muted-foreground md:col-span-full md:grid md:grid-cols-subgrid"
            >
              <span>Project</span>
              <span>Open issues</span>
              <span>Pull requests</span>
              <span className="hidden xl:block">Last run</span>
              <span className="justify-self-end">Next</span>
            </li>
            {numbers.projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel data-testid="home-runs">
          <SectionTitle
            about="recentRuns"
            label="Recent runs"
            action={
              <Link
                href="/app/runs"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                All Runs
              </Link>
            }
          >
            Recent runs
          </SectionTitle>
          <ul className="divide-y">
            {numbers.recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/app/runs/${run.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2 text-[13px] hover:bg-muted/40"
                >
                  <span className="truncate">{run.title}</span>
                  <StatusBadge status={run.status} />
                  <LocalTime
                    iso={run.createdAt}
                    className="font-mono text-[11px] text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel data-testid="home-prs">
          <SectionTitle about="recentPrs" label="Recent pull requests">
            Recent pull requests
          </SectionTitle>
          {numbers.recentPrs.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
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
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-[13px] hover:bg-muted/40"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      #{item.pr!.number}
                    </span>
                    <span className="truncate">{item.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {item.projectName} · {item.pr!.state}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
