"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { ProgressBar } from "@/components/tuff/progress-bar";
import { RollingNumber } from "@/components/tuff/rolling-number";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE, type FlowFilter } from "@/lib/viz/cockpit-views";
import type { RunPoint } from "@/lib/viz/project";
import type { Severity } from "@/server/engine/schema";
import type { Cockpit } from "@/server/projects/cockpit";

/*
 * The four cards under the cockpit's canvas. Each answers one question,
 * with numbers counted from the run and the project's earlier runs.
 */

export interface Delivered {
  sent: number;
  total: number;
}

function Card({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      className="flex min-h-48 flex-col rounded-card bg-card p-5"
      data-testid={testId}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A small line over the project's runs; the last point is "now". */
function Line({ values }: { values: number[] }) {
  const w = 220;
  const h = 64;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map(
    (value, index) =>
      [
        (index / Math.max(1, values.length - 1)) * (w - 8) + 4,
        h - 6 - ((value - min) / span) * (h - 12),
      ] as const,
  );
  const d = points
    .map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join("");
  const [lx, ly] = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-16 w-full overflow-visible"
      aria-hidden="true"
    >
      <path
        d={`${d}L${lx} ${h}L${points[0][0]} ${h}Z`}
        fill="var(--brand)"
        fillOpacity="0.12"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        className="glow"
      />
      <circle cx={lx} cy={ly} r="3.5" fill="var(--brand)" className="glow" />
    </svg>
  );
}

export function SummaryCards({
  cockpit,
  earlier,
  delivered,
  selectedSeverity,
  onPick,
}: {
  cockpit: Cockpit;
  earlier: RunPoint[];
  /** Work orders sent to 8090 for this run; null when not linked. */
  delivered: Delivered | null;
  selectedSeverity: Severity | null;
  onPick: (filter: FlowFilter) => void;
}) {
  const { totals } = cockpit;
  const previous = earlier.at(-1);
  const difference =
    previous !== undefined ? totals.issues - previous.issues : null;
  const fixFirst = cockpit.issues
    .filter(
      (issue) => issue.severity === "critical" || issue.severity === "high",
    )
    .slice(0, 3);
  const history = [...earlier.map((point) => point.issues), totals.issues];
  const security = cockpit.issues.filter(
    (issue) => issue.type === "security_vulnerability",
  );
  const patched = security.filter(
    (issue) => (issue.remediation?.edits.length ?? 0) > 0,
  ).length;
  const places = cockpit.privacy
    ? cockpit.privacy.categories.reduce((sum, item) => sum + item.places, 0)
    : 0;
  const exposedPlaces = cockpit.privacy?.exposedPlaces ?? 0;

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="cockpit-cards"
    >
      {/* 1. How many, how bad, better or worse */}
      <Card title="Issues" testId="card-issues">
        <div className="flex items-baseline gap-3">
          <RollingNumber
            value={String(totals.issues)}
            className="text-3xl font-light tabular-nums"
          />
          {difference !== null ? (
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                difference > 0
                  ? "text-sev-critical"
                  : difference < 0
                    ? "text-ok"
                    : "text-muted-foreground",
              )}
            >
              {difference > 0 ? `+${difference}` : difference} vs last run
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">First run</span>
          )}
        </div>
        <ul className="mt-3 space-y-1">
          {SEVERITY_ORDER.map((severity) => {
            const count = totals.bySeverity[severity];
            return (
              <li key={severity}>
                <button
                  type="button"
                  disabled={count === 0}
                  aria-pressed={selectedSeverity === severity}
                  data-testid={`card-severity-${severity}`}
                  onClick={() => onPick({ key: "severity", value: severity })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm enabled:hover:bg-muted disabled:opacity-50",
                    selectedSeverity === severity && "bg-muted",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      selectedSeverity === severity && "glow",
                    )}
                    style={{ background: SEVERITY_TONE[severity] }}
                  />
                  <span className="flex-1">{SEVERITY_LABEL[severity]}</span>
                  <span className="font-mono text-xs tabular-nums">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* 2. What to do first */}
      <Card
        title="Fix first"
        testId="card-fix-first"
        action={
          fixFirst.length > 0 ? (
            <button
              type="button"
              className="text-xs text-link hover:underline"
              onClick={() =>
                onPick({
                  key: "severity",
                  value: totals.bySeverity.critical > 0 ? "critical" : "high",
                })
              }
            >
              View all
            </button>
          ) : null
        }
      >
        {fixFirst.length > 0 ? (
          <ul className="space-y-2">
            {fixFirst.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/app/runs/${cockpit.runId}`}
                  className="group flex items-stretch gap-3 rounded-md py-1 hover:bg-muted"
                >
                  <span
                    aria-hidden="true"
                    className="w-0.5 shrink-0 rounded-full"
                    style={{ background: SEVERITY_TONE[issue.severity] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm">{issue.title}</span>
                    {issue.path ? (
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {issue.path}
                        {issue.startLine ? `:${issue.startLine}` : ""}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 self-center text-muted-foreground group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No critical or high issues.
          </p>
        )}
      </Card>

      {/* 3. Better or worse over time */}
      <Card title="Issues over runs" testId="card-history">
        {history.length > 1 ? (
          <>
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>
                Lowest{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {Math.min(...history)}
                </span>
              </span>
              <span>
                {history.length} runs · now{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {totals.issues}
                </span>
              </span>
            </div>
            <div className="mt-auto pt-3">
              <Line values={history} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            First run. The line starts with the next one.
          </p>
        )}
      </Card>

      {/* 4. How ready the fixes are */}
      <Card title="Readiness" testId="card-readiness">
        <div className="space-y-4">
          {security.length > 0 ? (
            <Meter
              label="Security issues with a checked patch"
              value={patched}
              total={security.length}
              tone={patched === security.length ? "positive" : "brand"}
            />
          ) : null}
          {delivered && delivered.total > 0 ? (
            <Meter
              label="Work orders in 8090"
              value={delivered.sent}
              total={delivered.total}
              tone={delivered.sent === delivered.total ? "positive" : "brand"}
            />
          ) : null}
          {places > 0 ? (
            <Meter
              label="Personal data reaching a log or an outside call"
              value={exposedPlaces}
              total={places}
              tone={exposedPlaces > 0 ? "negative" : "positive"}
            />
          ) : null}
          {security.length === 0 && !delivered?.total && places === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to measure in this run.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function Meter({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "brand" | "positive" | "negative";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="shrink-0 font-mono tabular-nums">
          {value} of {total}
        </span>
      </div>
      <ProgressBar
        label={label}
        valueText={`${value} of ${total}`}
        value={value}
        max={Math.max(total, 1)}
        size="sm"
        kind="meter"
        tone={tone}
      />
    </div>
  );
}
