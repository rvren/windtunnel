"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle, LoaderCircle, X } from "lucide-react";

import { Panel } from "@/components/panel";
import { AGENT_IDS, agentById, type AgentId } from "@/lib/agents";
import { formatCost } from "@/lib/cost";
import { KIND_LABEL, RUN_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/lib/viz/story";
import type { RunTimes } from "@/lib/viz/times";
import type { AgentStatus, RunRecord, RunStatus } from "@/server/engine/schema";

import { seconds } from "./stage-time";

/*
 * The run page's frame, after the reference layout: one bordered header
 * with the breadcrumb, the title, one grey line, the agents in a mono row,
 * the status figures on the right and the tabs. The checklist of stages
 * sits under the live view while the run goes on.
 */

const STATUS_DOT: Record<RunStatus, string> = {
  running: "bg-brand",
  completed: "bg-ok",
  failed: "bg-sev-critical",
  interrupted: "bg-sev-high",
};

const AGENT_WORD: Record<AgentStatus, string> = {
  pending: "waiting",
  running: "running",
  done: "done",
  failed: "failed",
  declined: "declined",
};

/** "77k", "1.2M": a token count at a glance. */
export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/** Every token the run used, across its stages. */
export function tokensOf(run: Pick<RunRecord, "usage">): number {
  return Object.values(run.usage).reduce(
    (sum, usage) =>
      sum +
      (usage
        ? usage.inputTokens +
          usage.outputTokens +
          usage.cacheReadTokens +
          usage.cacheWriteTokens
        : 0),
    0,
  );
}

/** Seconds since the run started, ticking while it runs. */
function useElapsed(times: RunTimes, running: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (times.start === null) return null;
  const end = times.end ?? (running ? now : null);
  return end === null ? null : Math.max(0, (end - times.start) / 1000);
}

export function RunHeader({
  run,
  times,
  projectName,
  subtitle,
  agents,
  stageAt,
  tools,
  actions,
  tabs,
}: {
  run: RunRecord;
  times: RunTimes;
  projectName: string | null;
  /** The grey line under the title. */
  subtitle: React.ReactNode;
  /** The agents' states, or null for a kind they take no part in. */
  agents: Record<AgentId, { status: AgentStatus; findings: number }> | null;
  /** "Stage 5/8". */
  stageAt: string;
  /** Small icon buttons at the top right, beside the breadcrumb. */
  tools: React.ReactNode;
  actions: React.ReactNode;
  tabs: React.ReactNode;
}) {
  const running = run.status === "running";
  const elapsed = useElapsed(times, running);
  const tokens = tokensOf(run);
  const kind = run.kind ?? "audit";
  return (
    <Panel className="p-5 sm:p-6" data-testid="run-header">
      <div className="flex items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted-foreground"
        >
          <Link href="/app/runs" className="hover:text-foreground">
            Runs
          </Link>
          {run.projectId && projectName ? (
            <>
              <span aria-hidden="true">/</span>
              <Link
                href={`/app/projects/${run.projectId}`}
                className="hover:text-foreground"
              >
                {projectName}
              </Link>
            </>
          ) : null}
          <span aria-hidden="true">/</span>
          <span>
            {kind === "audit" && !run.source ? "Requirement" : KIND_LABEL[kind]}
          </span>
          {run.sample ? null : (
            <>
              <span aria-hidden="true">/</span>
              <span className="font-mono">{run.models.reasoning}</span>
            </>
          )}
        </nav>
        <div className="-my-1 flex items-center gap-0.5 text-muted-foreground">
          {tools}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight font-semibold tracking-[-0.03em]">
            {run.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* The figures, as one quiet group. */}
          <div
            className="flex shrink-0 items-stretch overflow-hidden rounded-control border text-[0.8125rem]"
            data-testid="run-figures"
          >
            <span className="flex items-center gap-1.5 px-2.5 py-1">
              {running ? (
                <LoaderCircle
                  className="size-3 animate-spin text-link"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    STATUS_DOT[run.status],
                  )}
                  aria-hidden="true"
                />
              )}
              <span data-testid="run-status">
                {RUN_STATUS_LABEL[run.status]}
              </span>
            </span>
            <span
              className="border-l px-2.5 py-1 font-mono tabular-nums"
              title="What this run cost"
            >
              {run.sample ? "$0" : formatCost(run.costUsd ?? null)}
            </span>
            {elapsed !== null ? (
              <span className="border-l px-2.5 py-1 font-mono tabular-nums">
                {seconds(elapsed)}
              </span>
            ) : null}
            {tokens > 0 ? (
              <span className="border-l px-2.5 py-1 font-mono text-muted-foreground tabular-nums">
                {compact(tokens)} tokens
              </span>
            ) : null}
          </div>
          {actions}
        </div>
      </div>

      {/* The agents, in one mono line: who is doing what. */}
      <p
        className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground"
        data-testid="run-agents-row"
      >
        {agents
          ? AGENT_IDS.map((id) => {
              const agent = agents[id];
              return (
                <span key={id}>
                  <span className="text-foreground/80">
                    {agentById(id)?.name ?? id}
                  </span>{" "}
                  <span
                    className={cn(
                      agent.status === "running" && "text-link",
                      agent.status === "failed" && "text-sev-critical",
                    )}
                  >
                    {agent.findings > 0
                      ? `${agent.findings} found`
                      : AGENT_WORD[agent.status]}
                  </span>
                </span>
              );
            })
          : null}
        <span>{stageAt}</span>
      </p>

      <div className="mt-5 min-w-0 overflow-x-auto">{tabs}</div>
    </Panel>
  );
}

/** One stage of the checklist: its mark, name, what it said, its time. */
function Step({ chapter }: { chapter: Chapter }) {
  const pending = chapter.state === "pending";
  return (
    <li
      className="flex items-start gap-3 px-4 py-2.5"
      data-testid="run-step"
      data-state={chapter.state}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {chapter.state === "running" ? (
          <LoaderCircle className="size-3.5 animate-spin text-link" />
        ) : chapter.state === "done" ? (
          <Check className="size-3.5 text-ok" />
        ) : chapter.state === "failed" ? (
          <X className="size-3.5 text-sev-critical" />
        ) : (
          <Circle className="size-3 text-muted-foreground/40" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[0.8125rem]",
            pending ? "text-muted-foreground/60" : "text-foreground",
          )}
        >
          {chapter.label}
        </span>
        {chapter.line && !pending ? (
          <span className="block text-xs text-muted-foreground">
            {chapter.line}
          </span>
        ) : null}
      </span>
      {chapter.state === "running" ? (
        <span className="text-xs text-link">Running</span>
      ) : chapter.seconds !== null ? (
        <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          {seconds(chapter.seconds)}
        </span>
      ) : null}
    </li>
  );
}

/** The run's stages as a checklist, in a card. */
export function StageChecklist({
  title,
  chapters,
}: {
  title: string;
  chapters: Chapter[];
}) {
  const done = chapters.filter((chapter) => chapter.state === "done").length;
  return (
    <Panel className="overflow-hidden" data-testid="run-checklist">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="truncate text-[0.8125rem] font-medium">{title}</h2>
        <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          {done}/{chapters.length}
        </span>
      </header>
      <ol className="divide-y divide-border/60">
        {chapters.map((chapter) => (
          <Step key={chapter.stage} chapter={chapter} />
        ))}
      </ol>
    </Panel>
  );
}
