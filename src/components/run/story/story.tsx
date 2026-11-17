"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, LoaderCircle, X } from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { EASE } from "@/components/motion";
import { AgentIcon } from "@/components/run/badges";
import { ProgressBar, SegmentedBar } from "@/components/tuff/progress-bar";
import { RollingNumber } from "@/components/tuff/rolling-number";
import { AGENTS } from "@/lib/agents";
import { SEVERITY_LABEL, SEVERITY_ORDER, termsFor } from "@/lib/labels";
import type { Feed } from "@/lib/run-feed";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { Chapter, StoryResult } from "@/lib/viz/story";
import type { RunTimes } from "@/lib/viz/times";
import type { Stage } from "@/server/engine/schema";

import { LiveFindings } from "../live-findings";
import { AgentLanes } from "./lanes";
import { seconds } from "../stage-time";

/*
 * The run told stage by stage. A card appears when its stage starts, says
 * what the stage is doing while it runs, and turns into what it found when
 * it finishes. Numbers roll up and bars grow from nothing; under reduced
 * motion everything simply appears.
 */

export type ReportTab =
  "impact" | "findings" | "work-orders" | "model" | "scoreboard";

function Big({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <RollingNumber
        value={String(value)}
        className="text-2xl leading-none font-light tabular-nums"
      />
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Go({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-link hover:underline"
    >
      {label}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function Result({
  probable = false,
  result,
  onOpen,
}: {
  /** A requirement run: risks, suggested changes, proposed work orders. */
  probable?: boolean;
  result: StoryResult;
  onOpen: (tab: ReportTab) => void;
}) {
  const terms = termsFor(probable);
  switch (result.kind) {
    case "survey":
      return (
        <div className="flex flex-wrap items-end gap-8">
          {result.files !== null ? (
            <Big value={result.files} label="files read" />
          ) : null}
          {result.workspaces.length > 0 ? (
            <Big value={result.workspaces.length} label="workspaces" />
          ) : null}
          <p className="font-mono text-xs text-muted-foreground">
            {result.languages.join(" ")}
          </p>
        </div>
      );
    case "model":
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-8">
            {result.counts.map((item) => (
              <Big key={item.label} value={item.value} label={item.label} />
            ))}
            {result.parts > 0 ? (
              <Big value={result.parts} label="parts of the code" />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {result.roles.slice(0, 8).map((role) => (
              <span
                key={role}
                className="rounded-sm bg-muted px-2 py-0.5 text-xs text-foreground/85"
              >
                {role}
              </span>
            ))}
            <Go label="Design Model" onClick={() => onOpen("model")} />
          </div>
        </div>
      );
    case "coverage":
      return (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <Big value={result.total} label="gaps found by code" />
          <ul className="space-y-2">
            {result.byKind.slice(0, 4).map((item) => (
              <li
                key={item.label}
                className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-3 text-xs"
              >
                <span className="truncate text-muted-foreground">
                  {item.label}
                </span>
                <ProgressBar
                  label={item.label}
                  value={item.value}
                  max={Math.max(result.total, 1)}
                  size="sm"
                  kind="meter"
                />
                <span className="text-right font-mono tabular-nums">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "agents":
      return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Big value={result.total} label="findings filed" />
          <ul className="flex flex-wrap gap-2">
            {result.byAgent.map((agent) => (
              <li
                key={agent.id}
                className="flex items-center gap-2 rounded-tile bg-muted/60 px-2.5 py-1.5 text-xs"
              >
                <AgentIcon agentId={agent.id} className="size-3.5" />
                {agent.name}
                <span className="font-mono tabular-nums">{agent.findings}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "challenge": {
      const total = result.disputes + result.supports;
      return (
        <div className="grid gap-6 sm:grid-cols-[auto_auto_1fr] sm:items-center">
          <Big value={result.disputes} label="disputed" />
          <Big value={result.supports} label="supported" />
          <SegmentedBar
            label="Disputes and support"
            max={Math.max(total, 1)}
            segments={[
              {
                id: "dispute",
                label: "Disputed",
                value: result.disputes,
                color: "var(--sev-high)",
              },
              {
                id: "support",
                label: "Supported",
                value: result.supports,
                color: "var(--ok)",
              },
            ]}
          />
        </div>
      );
    }
    case "judge":
      return (
        <div className="space-y-4">
          <div className="grid gap-6 sm:grid-cols-[auto_auto_1fr] sm:items-center">
            <Big
              value={result.accepted}
              label={probable ? "risks kept" : "issues accepted"}
            />
            <Big value={result.rejected} label="rejected" />
            <div>
              <SegmentedBar
                label={`${terms.Issues} by severity`}
                max={Math.max(result.accepted, 1)}
                segments={SEVERITY_ORDER.filter(
                  (severity) => result.bySeverity[severity] > 0,
                ).map((severity) => ({
                  id: severity,
                  label: SEVERITY_LABEL[severity],
                  value: result.bySeverity[severity],
                  color: SEVERITY_TONE[severity],
                }))}
              />
              <p className="mt-2 flex flex-wrap gap-3 text-[0.6875rem] text-muted-foreground">
                {SEVERITY_ORDER.filter((s) => result.bySeverity[s] > 0).map(
                  (severity) => (
                    <span key={severity} className="flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full"
                        style={{ background: SEVERITY_TONE[severity] }}
                      />
                      {SEVERITY_LABEL[severity]}{" "}
                      <span className="font-mono text-foreground tabular-nums">
                        {result.bySeverity[severity]}
                      </span>
                    </span>
                  ),
                )}
              </p>
            </div>
          </div>
          {result.top.length > 0 ? (
            <ul className="space-y-1.5">
              {result.top.map((issue) => (
                <li key={issue.id} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-4 w-0.5 shrink-0 rounded-full"
                    style={{ background: SEVERITY_TONE[issue.severity] }}
                  />
                  <span className="truncate">{issue.title}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Go
            label={`See The ${result.accepted} ${result.accepted === 1 ? terms.Issue : terms.Issues}`}
            onClick={() => onOpen("findings")}
          />
        </div>
      );
    case "remediation":
      return result.code ? (
        <div className="grid gap-6 sm:grid-cols-[auto_auto_1fr] sm:items-center">
          <Big value={result.made} label="fixes written" />
          <Big value={result.patched} label="with a checked patch" />
          <div className="space-y-2">
            <ProgressBar
              label="Security issues with a checked patch"
              value={result.patched}
              max={Math.max(result.security, 1)}
              tone={
                result.security > 0 && result.patched === result.security
                  ? "positive"
                  : "brand"
              }
              kind="meter"
            />
            <Go
              label="Fixes In The Findings"
              onClick={() => onOpen("findings")}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-8">
          <Big value={result.made} label="suggested changes" />
          <p className="max-w-sm text-xs text-muted-foreground">
            Steps and a CWE and OWASP mapping for each security risk. Nothing is
            built yet, so there are no patches.
          </p>
          <Go
            label="See The Suggested Changes"
            onClick={() => onOpen("findings")}
          />
        </div>
      );
    case "work_orders":
      return (
        <div className="flex flex-wrap items-end gap-8">
          <Big
            value={result.total}
            label={probable ? "proposed work orders" : "work orders"}
          />
          <Go
            label={probable ? "Proposed Work Orders" : "Work Orders"}
            onClick={() => onOpen("work-orders")}
          />
        </div>
      );
  }
}

/** The agents at work: one compact tile each, with what it is doing. */
function AgentsAtWork({ feed }: { feed: Feed }) {
  return (
    <ul
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      data-testid="run-agents"
    >
      {AGENTS.map((agent) => {
        const lane = feed.agents[agent.id];
        const now =
          lane.note ??
          (lane.reading
            ? `Reading ${lane.reading}`
            : (lane.scenarios.at(-1) ?? "Waiting to start"));
        return (
          <li
            key={agent.id}
            data-testid={`run-agent-${agent.id}`}
            data-status={lane.status}
            className={cn(
              "flex flex-col gap-2 rounded-tile bg-muted/40 p-3 ring-1 ring-transparent transition-colors duration-300",
              lane.status === "running" && "ring-brand/30",
            )}
          >
            <div className="flex items-center gap-2">
              <AgentIcon agentId={agent.id} className="size-4" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {agent.name}
              </span>
              {lane.status === "running" ? (
                <LoaderCircle
                  className="size-3.5 animate-spin text-brand"
                  aria-hidden="true"
                />
              ) : lane.status === "done" ? (
                <Check className="size-3.5 text-ok" aria-hidden="true" />
              ) : lane.status === "failed" || lane.status === "declined" ? (
                <X className="size-3.5 text-sev-critical" aria-hidden="true" />
              ) : null}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={now}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="line-clamp-2 min-h-8 text-[0.6875rem] leading-snug text-muted-foreground"
              >
                {now}
              </motion.p>
            </AnimatePresence>
            <p className="font-mono text-[0.6875rem] tabular-nums">
              {lane.findings} {lane.findings === 1 ? "finding" : "findings"}
              {lane.scenarios.length > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {lane.scenarios.length} scenarios
                </span>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const TIP: Partial<Record<Stage, "agents" | "liveFindings">> = {
  agents: "agents",
};

export function Story({
  chapters,
  feed,
  times,
  liveMap,
  onOpen,
  probable = false,
}: {
  chapters: Chapter[];
  /** A requirement run: its results are probable risks. */
  probable?: boolean;
  feed: Feed;
  /** When each part of the run happened, for the agents' lanes. */
  times?: RunTimes;
  /** The live map of a code run, shown while the agents read. */
  liveMap?: React.ReactNode;
  onOpen: (tab: ReportTab) => void;
}) {
  const reduced = useReducedMotion();
  const started = chapters.filter((chapter) => chapter.state !== "pending");
  // While a stage is at work its card leads, right under the stepper, and
  // the results follow newest first, so what is happening never scrolls
  // away. Once nothing runs, the story reads in order.
  const live = started.some((chapter) => chapter.state === "running");
  const shown = live
    ? [
        ...started.filter((chapter) => chapter.state === "running"),
        ...started.filter((chapter) => chapter.state !== "running").reverse(),
      ]
    : started;

  return (
    <ol className="space-y-3" data-testid="run-story">
      <AnimatePresence initial={false}>
        {shown.map((chapter) => (
          <motion.li
            key={chapter.stage}
            id={`chapter-${chapter.stage}`}
            layout={!reduced}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            data-testid={`chapter-${chapter.stage}`}
            data-state={chapter.state}
            className={cn(
              "scroll-mt-24 rounded-card bg-card p-5 ring-1 ring-transparent transition-shadow duration-500",
              chapter.state === "running" &&
                "ring-brand/30 shadow-[0_0_24px_-8px_var(--glow)]",
              chapter.state === "failed" && "ring-sev-critical/40",
            )}
          >
            <header className="mb-4 flex items-center gap-3">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  chapter.state === "done" && "bg-brand text-brand-foreground",
                  chapter.state === "running" &&
                    "text-brand ring-1 ring-brand/40",
                  chapter.state === "failed" && "bg-sev-critical text-white",
                )}
              >
                {chapter.state === "done" ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : chapter.state === "failed" ? (
                  <X className="size-3.5" aria-hidden="true" />
                ) : (
                  <LoaderCircle
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                )}
              </span>
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                {chapter.label}
                {TIP[chapter.stage] ? (
                  <InfoTip about={TIP[chapter.stage]!} label={chapter.label} />
                ) : null}
              </h3>
              <p
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  chapter.state === "failed"
                    ? "text-sev-critical"
                    : "text-muted-foreground",
                )}
              >
                {chapter.line}
              </p>
              {chapter.state === "done" && chapter.seconds !== null ? (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {seconds(chapter.seconds)}
                </span>
              ) : null}
            </header>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={
                  chapter.state === "done" && chapter.result ? "result" : "live"
                }
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                {chapter.state === "done" && chapter.result ? (
                  <div className="space-y-5">
                    <Result
                      result={chapter.result}
                      onOpen={onOpen}
                      probable={probable}
                    />
                    {chapter.stage === "agents" && times ? (
                      <AgentLanes times={times} feed={feed} live={false} />
                    ) : null}
                  </div>
                ) : chapter.stage === "agents" &&
                  chapter.state === "running" ? (
                  <div className="space-y-5">
                    {liveMap}
                    {times ? (
                      <AgentLanes times={times} feed={feed} live />
                    ) : (
                      <AgentsAtWork feed={feed} />
                    )}
                    <LiveFindings feed={feed} />
                  </div>
                ) : chapter.state === "running" ? (
                  <p className="text-sm text-muted-foreground">
                    Working on it. This card fills in when the stage finishes.
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
