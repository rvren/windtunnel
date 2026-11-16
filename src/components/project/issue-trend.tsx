"use client";

import { useState } from "react";
import Link from "next/link";

import { InfoTip } from "@/components/info-tip";
import { Panel } from "@/components/panel";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { trendScale, type TrendPoint } from "@/lib/viz/trend";
import type { Severity } from "@/server/engine/schema";

/*
 * Open issues by severity over the project's finished audits: one stacked
 * bar per run, oldest on the left. Severity is an order, so the fills are
 * one neutral ramp (critical strongest), never the status hues.
 */

// Whole class names, so Tailwind finds them.
const FILL: Record<Severity, string> = {
  critical: "bg-rank-critical",
  high: "bg-rank-high",
  medium: "bg-rank-medium",
  low: "bg-rank-low",
};

const DAY = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const day = (iso: string) => DAY.format(new Date(iso));

const PLOT = 160;

export function IssueTrend({
  points,
  fixed,
}: {
  points: TrendPoint[];
  /** Tracked issues a later run no longer found. */
  fixed: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const last = points.at(-1);
  const previous = points.at(-2);
  const change = last && previous ? last.total - previous.total : null;
  const { top, ticks } = trendScale(
    Math.max(0, ...points.map((point) => point.total)),
  );
  // Bottom of the stack first: low under critical, so the top of each bar
  // is its most severe part.
  const stack = [...SEVERITY_ORDER].reverse();

  return (
    <Panel className="p-5" data-testid="project-trend">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[13px] font-medium">
            Open issues
            <InfoTip about="openTrend" label="Open issues" />
          </h2>
          {last ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono text-foreground tabular-nums">
                {last.total}
              </span>{" "}
              now
              {change !== null ? (
                <>
                  {" · "}
                  <span
                    className="font-mono tabular-nums"
                    data-testid="project-trend-change"
                  >
                    {change > 0 ? `+${change}` : change}
                  </span>{" "}
                  since the last run
                </>
              ) : null}
              {" · "}
              <span className="font-mono text-foreground tabular-nums">
                {fixed}
              </span>{" "}
              fixed
            </p>
          ) : null}
        </div>
        <ul
          className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
          aria-label="Legend"
        >
          {SEVERITY_ORDER.map((severity) => (
            <li key={severity} className="flex items-center gap-1.5">
              <span
                className={cn("size-2.5 rounded-[2px]", FILL[severity])}
                aria-hidden="true"
              />
              {SEVERITY_LABEL[severity]}
            </li>
          ))}
        </ul>
      </header>

      {points.length < 2 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          The trend starts with the next finished run.
        </p>
      ) : (
        <div className="mt-5 flex gap-2" aria-hidden="true">
          {/* The y axis: a few round values, quiet. */}
          <div
            className="relative w-6 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums"
            style={{ height: PLOT }}
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2"
                style={{ top: PLOT - (tick / top) * PLOT }}
              >
                {tick}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: PLOT }}>
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className="absolute inset-x-0 border-t border-border"
                  style={{ top: PLOT - (tick / top) * PLOT }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
                {points.map((point, index) => {
                  const shown = stack.filter(
                    (severity) => point.counts[severity] > 0,
                  );
                  return (
                    <Link
                      key={point.runId}
                      href={`/app/runs/${point.runId}`}
                      tabIndex={-1}
                      data-testid="project-trend-bar"
                      className="group relative flex h-full max-w-12 flex-1 flex-col justify-end outline-none"
                      onMouseEnter={() => setHover(index)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div
                        className={cn(
                          "flex flex-col-reverse gap-[2px] transition-opacity",
                          hover !== null && hover !== index && "opacity-50",
                        )}
                        style={{ height: (point.total / top) * PLOT }}
                      >
                        {shown.map((severity, at) => (
                          <div
                            key={severity}
                            className={cn(
                              "min-h-px",
                              FILL[severity],
                              at === shown.length - 1 && "rounded-t-[4px]",
                            )}
                            style={{
                              flexGrow: point.counts[severity],
                              flexBasis: 0,
                            }}
                          />
                        ))}
                      </div>
                      {hover === index ? (
                        <div
                          className={cn(
                            "pointer-events-none absolute bottom-full z-10 mb-2 w-40 rounded-md border bg-popover p-2.5 text-xs text-popover-foreground shadow-sm",
                            index > points.length / 2 ? "right-0" : "left-0",
                          )}
                          data-testid="project-trend-tooltip"
                        >
                          <p className="mb-1.5 font-medium">
                            {day(point.createdAt)} · {point.total} open
                          </p>
                          <ul className="space-y-0.5">
                            {SEVERITY_ORDER.map((severity) => (
                              <li
                                key={severity}
                                className="flex items-center justify-between gap-3 text-muted-foreground"
                              >
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "size-2 rounded-[2px]",
                                      FILL[severity],
                                    )}
                                  />
                                  {SEVERITY_LABEL[severity]}
                                </span>
                                <span className="font-mono text-foreground tabular-nums">
                                  {point.counts[severity]}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{day(points[0].createdAt)}</span>
              <span>{day(points[points.length - 1].createdAt)}</span>
            </div>
          </div>
        </div>
      )}

      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>Open issues by severity, per finished run</caption>
        <thead>
          <tr>
            <th>Run</th>
            {SEVERITY_ORDER.map((severity) => (
              <th key={severity}>{SEVERITY_LABEL[severity]}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.runId}>
              <td>{day(point.createdAt)}</td>
              {SEVERITY_ORDER.map((severity) => (
                <td key={severity}>{point.counts[severity]}</td>
              ))}
              <td>{point.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
