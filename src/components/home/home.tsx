"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  FolderPlus,
  GitMerge,
  GitPullRequest,
  Play,
  ShieldAlert,
} from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { PullRequestRefresher } from "@/components/issues/pr-refresher";
import { LocalTime } from "@/components/local-time";
import { EASE, FadeIn, FadeInItem } from "@/components/motion";
import { StatusBadge } from "@/components/run/badges";
import { SegmentedBar } from "@/components/tuff/progress-bar";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { HomeNumbers } from "@/lib/viz/home";

/*
 * The home page as a board of projects. A thin strip says where every
 * issue is in the fix pipeline; then one card per project: how much of it
 * is fixed, its open issues by severity, its pull requests and last run,
 * and the one thing to do next. Recent runs and pull requests close it.
 */

type Project = HomeNumbers["projects"][number];

const NEXT_ICON = {
  rescan: GitMerge,
  fix: ShieldAlert,
  run: Play,
  open: ArrowRight,
} as const;

/** A ring that fills to the share of the project's issues fixed. */
function Ring({ share }: { share: number }) {
  const reduced = useReducedMotion();
  const r = 22;
  const length = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg
        viewBox="-28 -28 56 56"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          r={r}
          fill="none"
          stroke="var(--surface-raised)"
          strokeWidth="5"
        />
        <motion.circle
          r={r}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={length}
          initial={reduced ? false : { strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - share) }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-medium tabular-nums">
        {Math.round(share * 100)}%
      </span>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const Next = NEXT_ICON[project.next.kind];
  const urgent = project.next.kind === "rescan" || project.next.kind === "fix";
  return (
    <article
      className="flex h-full flex-col gap-4 rounded-card bg-card p-5 ring-1 ring-transparent transition-shadow duration-300 hover:ring-foreground/10"
      data-testid="home-project"
    >
      <header className="flex items-start gap-4">
        <Ring share={project.fixedShare} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/app/projects/${project.id}`}
            className="block truncate text-base font-medium hover:underline"
          >
            {project.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {project.fixed} fixed · {project.open} open
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {project.lastRun ? (
              <>
                Last run <LocalTime iso={project.lastRun.at} />
              </>
            ) : (
              "Not run yet"
            )}
          </p>
        </div>
      </header>

      <div>
        {project.open > 0 ? (
          <SegmentedBar
            label={`${project.name}: open issues by severity`}
            size="sm"
            max={project.open}
            segments={SEVERITY_ORDER.filter(
              (s) => project.bySeverity[s] > 0,
            ).map((severity) => ({
              id: severity,
              label: SEVERITY_LABEL[severity],
              value: project.bySeverity[severity],
              color: SEVERITY_TONE[severity],
            }))}
          />
        ) : (
          <div className="h-1.5 rounded-full bg-foreground/[0.06]" />
        )}
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {SEVERITY_ORDER.map((severity) => (
            <li key={severity} className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: SEVERITY_TONE[severity] }}
              />
              <span className="font-mono text-foreground tabular-nums">
                {project.bySeverity[severity]}
              </span>
              {SEVERITY_LABEL[severity].toLowerCase()}
            </li>
          ))}
        </ul>
      </div>

      <p className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <GitPullRequest className="size-3.5" aria-hidden="true" />
          <span className="font-mono text-foreground tabular-nums">
            {project.prs}
          </span>
          {project.prs === 1 ? "pull request open" : "pull requests open"}
        </span>
        {project.merged > 0 ? (
          <span className="flex items-center gap-1.5 text-sev-high">
            <GitMerge className="size-3.5" aria-hidden="true" />
            {project.merged} merged
          </span>
        ) : null}
      </p>

      <Link
        href={`/app/projects/${project.id}`}
        className={cn(
          "mt-auto flex items-center gap-2 rounded-tile px-3 py-2 text-sm ring-1 transition-colors",
          urgent
            ? "bg-brand/10 ring-brand/30 hover:bg-brand/15"
            : "ring-foreground/10 hover:bg-muted",
        )}
        data-testid="home-project-next"
      >
        <Next
          className={cn(
            "size-4",
            urgent ? "text-brand" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <span className="flex-1">{project.next.label}</span>
        <ArrowRight
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </article>
  );
}

export function Home({ numbers }: { numbers: HomeNumbers }) {
  return (
    <div className="space-y-6" data-testid="home">
      <PullRequestRefresher />

      {/* One card per project */}
      <section aria-label="Projects">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            Projects
            <InfoTip about="projectsHealth" label="Projects" />
          </h2>
          <Link
            href="/app/projects"
            className="text-xs text-link hover:underline"
          >
            Manage projects
          </Link>
        </div>
        {numbers.projects.length === 0 ? (
          <Link
            href="/app/projects"
            className="flex flex-col items-center gap-2 rounded-card border border-dashed px-6 py-12 text-center text-sm text-muted-foreground hover:text-foreground"
          >
            <FolderPlus className="size-5" aria-hidden="true" />
            Add your first project
          </Link>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {numbers.projects.map((project) => (
              <FadeInItem key={project.id}>
                <ProjectCard project={project} />
              </FadeInItem>
            ))}
          </ul>
        )}
      </section>

      {/* What happened lately */}
      <FadeIn delay={0.1} className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card bg-card p-5" data-testid="home-runs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              Recent runs
              <InfoTip about="recentRuns" label="Recent runs" />
            </h2>
            <Link
              href="/app/runs"
              className="text-xs text-link hover:underline"
            >
              All runs
            </Link>
          </div>
          <ul className="divide-y">
            {numbers.recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/app/runs/${run.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-sm"
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
        </section>

        <section className="rounded-card bg-card p-5" data-testid="home-prs">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
            Recent pull requests
            <InfoTip about="recentPrs" label="Recent pull requests" />
          </h2>
          {numbers.recentPrs.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
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
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm"
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
        </section>
      </FadeIn>
    </div>
  );
}
