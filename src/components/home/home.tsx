"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  ShieldAlert,
} from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { PullRequestRefresher } from "@/components/issues/pr-refresher";
import { LocalTime } from "@/components/local-time";
import { EASE, FadeIn } from "@/components/motion";
import { StatusBadge } from "@/components/run/badges";
import { SegmentedBar } from "@/components/tuff/progress-bar";
import { RollingNumber } from "@/components/tuff/rolling-number";
import type { ExplainKey } from "@/lib/explain";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { HomeNumbers } from "@/lib/viz/home";

/*
 * The home page: the fix pipeline across every project. What needs a
 * person first, then where issues stand, how fast they get fixed, each
 * project, and the latest pull requests and runs.
 */

function Card({
  title,
  about,
  className,
  children,
  testId,
  action,
}: {
  title: string;
  about: ExplainKey;
  className?: string;
  children: React.ReactNode;
  testId: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={cn("flex flex-col rounded-card bg-card p-5", className)}
      data-testid={testId}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          <InfoTip about={about} label={title} />
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

const days = (value: number) =>
  value < 1
    ? "under a day"
    : `${Math.round(value)} ${Math.round(value) === 1 ? "day" : "days"}`;

function Weeks({ weeks }: { weeks: HomeNumbers["open"]["weeks"] }) {
  const reduced = useReducedMotion();
  const max = Math.max(
    1,
    ...weeks.flatMap((week) => [week.opened, week.fixed]),
  );
  return (
    <div>
      <div
        className="flex h-24 items-end gap-2"
        aria-label="Opened and fixed per week"
      >
        {weeks.map((week) => (
          <div
            key={week.end}
            className="flex flex-1 items-end justify-center gap-0.5"
          >
            {[
              { value: week.opened, color: "var(--sev-high)", label: "opened" },
              { value: week.fixed, color: "var(--ok)", label: "fixed" },
            ].map((bar) => (
              <motion.span
                key={bar.label}
                title={`${bar.value} ${bar.label}`}
                className="w-2.5 rounded-t-sm"
                style={{ background: bar.color, opacity: bar.value ? 1 : 0.25 }}
                initial={reduced ? false : { height: 0 }}
                animate={{ height: `${Math.max(4, (bar.value / max) * 96)}px` }}
                transition={{ duration: 0.6, ease: EASE }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>8 weeks ago</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-sev-high" /> opened
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-ok" /> fixed
          </span>
        </span>
        <span>this week</span>
      </div>
    </div>
  );
}

export function Home({ numbers }: { numbers: HomeNumbers }) {
  const { needs, open, pipeline, timeToFix } = numbers;
  const nothingNeeded =
    needs.awaitingRescan.length +
      needs.prsOpen.length +
      needs.unfixedSerious.length ===
    0;
  const stages = [
    { label: "Open", value: pipeline.open, color: "var(--sev-high)" },
    { label: "PR open", value: pipeline.prOpen, color: "var(--brand)" },
    { label: "Merged", value: pipeline.merged, color: "var(--sev-medium)" },
    { label: "Fixed", value: pipeline.fixed, color: "var(--ok)" },
  ];
  const widest = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="space-y-4" data-testid="home">
      <PullRequestRefresher />

      <FadeIn className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Needs you" about="needsYou" testId="home-needs">
          {nothingNeeded ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing waits on you: no merged fix to confirm, no open pull
              request, no critical or high issue without a fix.
            </p>
          ) : (
            <ul className="space-y-2">
              {needs.awaitingRescan.map((item) => (
                <li key={item.projectId}>
                  <Link
                    href={`/app/projects/${item.projectId}`}
                    className="flex items-center gap-3 rounded-tile bg-sev-high/10 px-3 py-2.5 text-sm ring-1 ring-sev-high/25 hover:bg-sev-high/15"
                  >
                    <GitMerge
                      className="size-4 shrink-0 text-sev-high"
                      aria-hidden="true"
                    />
                    <span className="flex-1">
                      <span className="font-medium">{item.name}:</span>{" "}
                      {item.count}{" "}
                      {item.count === 1 ? "fix merged" : "fixes merged"}, rescan
                      to confirm
                    </span>
                    <ArrowRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
              {needs.prsOpen.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.pr!.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-tile px-3 py-2.5 text-sm ring-1 ring-foreground/10 hover:bg-muted"
                  >
                    <GitPullRequest
                      className="size-4 shrink-0 text-link"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.projectName} · #{item.pr!.number} waiting for
                        review
                      </span>
                    </span>
                    <ExternalLink
                      className="size-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
              {needs.unfixedSerious.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/app/projects/${item.projectId}`}
                    className="flex items-center gap-3 rounded-tile px-3 py-2.5 text-sm ring-1 ring-foreground/10 hover:bg-muted"
                  >
                    <ShieldAlert
                      className="size-4 shrink-0"
                      style={{ color: SEVERITY_TONE[item.severity] }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.projectName} · {SEVERITY_LABEL[item.severity]} ·
                        no fix yet
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Fix pipeline" about="pipeline" testId="home-pipeline">
          <ul className="space-y-3">
            {stages.map((stage) => (
              <li
                key={stage.label}
                className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground">{stage.label}</span>
                <div className="h-6 overflow-hidden rounded-md bg-foreground/[0.05]">
                  <motion.div
                    className="h-full rounded-md"
                    style={{ background: stage.color, opacity: 0.85 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(stage.value / widest) * 100}%` }}
                    transition={{ duration: 0.7, ease: EASE }}
                  />
                </div>
                <span className="text-right font-mono tabular-nums">
                  {stage.value}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </FadeIn>

      <FadeIn
        delay={0.05}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <Card title="Open issues" about="openIssues" testId="home-open">
          <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <div>
              <RollingNumber
                value={String(open.total)}
                className="text-4xl leading-none font-light tabular-nums"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                across all projects
              </p>
              <div className="mt-4 w-48">
                <SegmentedBar
                  label="Open issues by severity"
                  size="sm"
                  max={Math.max(open.total, 1)}
                  segments={SEVERITY_ORDER.filter(
                    (s) => open.bySeverity[s] > 0,
                  ).map((severity) => ({
                    id: severity,
                    label: SEVERITY_LABEL[severity],
                    value: open.bySeverity[severity],
                    color: SEVERITY_TONE[severity],
                  }))}
                />
                <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                  {SEVERITY_ORDER.map((severity) => (
                    <li key={severity} className="flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: SEVERITY_TONE[severity] }}
                      />
                      {SEVERITY_LABEL[severity]}
                      <span className="font-mono text-foreground tabular-nums">
                        {open.bySeverity[severity]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Weeks weeks={open.weeks} />
          </div>
        </Card>

        <Card title="Time to fix" about="timeToFix" testId="home-time">
          <p className="text-4xl leading-none font-light tabular-nums">
            {timeToFix.medianDays === null ? "—" : days(timeToFix.medianDays)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {timeToFix.fixed
              ? `median from first seen to confirmed gone, over ${timeToFix.fixed} fixed`
              : "No issue has been fixed and confirmed yet."}
          </p>
          {timeToFix.oldestCritical ? (
            <Link
              href={`/app/projects/${timeToFix.oldestCritical.projectId}`}
              className="mt-auto block rounded-tile bg-sev-critical/10 p-3 text-sm ring-1 ring-sev-critical/25 hover:bg-sev-critical/15"
            >
              <span className="text-xs text-sev-critical">
                Oldest open critical · {days(timeToFix.oldestCritical.days)}
              </span>
              <span className="mt-0.5 block truncate">
                {timeToFix.oldestCritical.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {timeToFix.oldestCritical.projectName}
              </span>
            </Link>
          ) : null}
        </Card>
      </FadeIn>

      <FadeIn
        delay={0.1}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <Card
          title="Projects"
          about="projectsHealth"
          testId="home-projects"
          action={
            <Link
              href="/app/projects"
              className="text-xs text-link hover:underline"
            >
              All projects
            </Link>
          }
        >
          {numbers.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <ul className="divide-y">
              {numbers.projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/app/projects/${project.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-4 py-2.5 text-sm hover:text-foreground"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {project.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {project.lastRun ? (
                          <>
                            Last run <LocalTime iso={project.lastRun.at} />
                          </>
                        ) : (
                          "Not run yet"
                        )}
                      </span>
                    </span>
                    <span
                      className="flex items-center gap-1 font-mono text-xs tabular-nums"
                      title="Critical"
                    >
                      <span className="size-1.5 rounded-full bg-sev-critical" />
                      {project.critical}
                    </span>
                    <span
                      className="flex items-center gap-1 font-mono text-xs tabular-nums"
                      title="High"
                    >
                      <span className="size-1.5 rounded-full bg-sev-high" />
                      {project.high}
                    </span>
                    <span
                      className="flex items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums"
                      title="Open pull requests"
                    >
                      <GitPullRequest className="size-3" aria-hidden="true" />
                      {project.prs}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent pull requests" about="recentPrs" testId="home-prs">
          {numbers.recentPrs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fix pull requests yet. Open one from an issue in a run.
            </p>
          ) : (
            <ul className="space-y-2">
              {numbers.recentPrs.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.pr!.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      #{item.pr!.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {item.pr!.state}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={0.15}>
        <Card
          title="Recent runs"
          about="recentRuns"
          testId="home-runs"
          action={
            <Link
              href="/app/runs"
              className="text-xs text-link hover:underline"
            >
              All runs
            </Link>
          }
        >
          <ul className="divide-y">
            {numbers.recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/app/runs/${run.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-2.5 text-sm"
                >
                  <span className="truncate">{run.title}</span>
                  <StatusBadge status={run.status} />
                  <LocalTime
                    iso={run.createdAt}
                    className="font-mono text-xs text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </FadeIn>
    </div>
  );
}
