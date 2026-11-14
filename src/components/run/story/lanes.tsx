"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";

import { EASE } from "@/components/motion";
import { AgentIcon } from "@/components/run/badges";
import { AGENTS } from "@/lib/agents";
import type { Feed } from "@/lib/run-feed";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { RunTimes } from "@/lib/viz/times";

import { seconds } from "../stage-time";

/*
 * The agents at work, side by side on one clock. Each lane is a bar from
 * when its agent started to when it finished (or now); scenarios land on it
 * as ticks and findings as dots, at the moment they arrived. Bars that
 * overlap are agents working at the same time. All from the run's events.
 */

/** The time now, ticking while something is live. */
function useNow(live: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [live]);
  return now;
}

export function AgentLanes({
  times,
  feed,
  live,
}: {
  times: RunTimes;
  feed: Feed;
  /** True while the agents stage runs: bars grow and heads glow. */
  live: boolean;
}) {
  const reduced = useReducedMotion();
  const now = useNow(live);
  const spans = AGENTS.map((agent) => times.agents[agent.id]).filter(
    (span) => span !== undefined,
  );
  if (spans.length === 0) return null;
  const t0 = Math.min(...spans.map((span) => span.start));
  const t1 = live
    ? Math.max(now, ...spans.map((span) => span.end ?? 0))
    : Math.max(...spans.map((span) => span.end ?? span.start));
  const length = Math.max(1, t1 - t0);
  const at = (time: number) => ((time - t0) / length) * 100;
  // How many agents are working at once, right now.
  const together = AGENTS.filter((agent) => {
    const span = times.agents[agent.id];
    return span && span.end === undefined;
  }).length;

  return (
    <section aria-label="Agents in parallel" data-testid="agent-lanes">
      <div className="mb-2 flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>
          {live && together > 1
            ? `${together} agents working at the same time`
            : "Each agent on one clock"}
        </span>
        <span className="font-mono tabular-nums">{seconds(length / 1000)}</span>
      </div>
      <ul className="space-y-2.5">
        {AGENTS.map((agent) => {
          const span = times.agents[agent.id];
          const lane = feed.agents[agent.id];
          const marks = times.marks.filter((mark) => mark.agentId === agent.id);
          const now_ =
            lane.note ??
            (lane.reading
              ? `Reading ${lane.reading}`
              : (lane.scenarios.at(-1) ?? null));
          const start = span ? at(span.start) : 0;
          const end = span ? at(span.end ?? t1) : 0;
          return (
            <li
              key={agent.id}
              className="grid grid-cols-[9.5rem_minmax(0,1fr)_3.5rem] items-center gap-3"
              data-testid={`lane-${agent.id}`}
              data-status={lane.status}
            >
              <div className="flex min-w-0 items-center gap-2">
                <AgentIcon agentId={agent.id} className="size-3.5 shrink-0" />
                <span className="truncate text-xs font-medium">
                  {agent.name}
                </span>
                {lane.status === "done" ? (
                  <Check
                    className="size-3 shrink-0 text-ok"
                    aria-hidden="true"
                  />
                ) : lane.status === "failed" || lane.status === "declined" ? (
                  <X
                    className="size-3 shrink-0 text-sev-critical"
                    aria-hidden="true"
                  />
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="relative h-3 overflow-hidden rounded-full bg-foreground/[0.06]">
                  {span ? (
                    <motion.div
                      className={cn(
                        "absolute inset-y-0 rounded-full",
                        span.end === undefined ? "bg-brand/45" : "bg-brand/25",
                      )}
                      style={{ left: `${start}%` }}
                      initial={false}
                      animate={{ width: `${Math.max(1, end - start)}%` }}
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { duration: 0.3, ease: "linear" }
                      }
                    />
                  ) : null}
                  {marks.map((mark, index) =>
                    mark.kind === "scenario" ? (
                      <span
                        key={`s${index}`}
                        aria-hidden="true"
                        className="absolute top-0.5 bottom-0.5 w-px bg-foreground/45"
                        style={{ left: `${at(mark.at)}%` }}
                      />
                    ) : (
                      <motion.span
                        key={`f${index}`}
                        aria-hidden="true"
                        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-canvas"
                        style={{
                          left: `${at(mark.at)}%`,
                          background: mark.severity
                            ? SEVERITY_TONE[mark.severity]
                            : "var(--brand)",
                        }}
                        initial={reduced ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.35, ease: EASE }}
                      />
                    ),
                  )}
                  {/* The head of a lane still at work */}
                  {span && span.end === undefined && live ? (
                    <motion.span
                      aria-hidden="true"
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand glow"
                      style={{ left: `${end}%` }}
                      animate={reduced ? undefined : { opacity: [1, 0.45, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    />
                  ) : null}
                </div>
                {live && now_ ? (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {now_}
                  </p>
                ) : null}
              </div>

              <span className="text-right font-mono text-[11px] tabular-nums">
                {lane.findings}
                <span className="text-muted-foreground"> found</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
