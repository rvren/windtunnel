"use client";

import { ArrowRight } from "lucide-react";

import { SegmentedBar } from "@/components/tuff/progress-bar";
import { RollingNumber } from "@/components/tuff/rolling-number";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { RunTimes } from "@/lib/viz/times";
import type { RunRecord } from "@/server/engine/schema";

import { StageTime } from "../stage-time";
import type { ReportTab } from "./story";

/*
 * A finished run at a glance: issues by severity, work orders, fixes, and
 * where the time went. Each tile opens its place in the report.
 */

function Tile({
  label,
  value,
  onClick,
  children,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <RollingNumber
        value={String(value)}
        className="text-3xl leading-none font-light tabular-nums"
      />
      {children}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="mt-auto inline-flex w-fit items-center gap-1 text-xs text-link hover:underline"
        >
          Open
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

export function RunSummary({
  run,
  times,
  onOpen,
}: {
  run: RunRecord;
  times: RunTimes;
  onOpen: (tab: ReportTab) => void;
}) {
  const security = run.groups.filter(
    (group) => group.type === "security_vulnerability",
  ).length;
  const patched = Object.values(run.remediations ?? {}).filter(
    (record) => record.edits.length > 0,
  ).length;
  const bySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    value: run.groups.filter((group) => group.severity === severity).length,
  }));

  return (
    <div className="space-y-3" data-testid="run-summary">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={run.source ? "Issues accepted" : "Risks kept"}
          value={run.groups.length}
          onClick={() => onOpen("findings")}
        >
          <SegmentedBar
            label={run.source ? "Issues by severity" : "Risks by severity"}
            max={Math.max(run.groups.length, 1)}
            size="sm"
            segments={bySeverity
              .filter((item) => item.value > 0)
              .map(({ severity, value }) => ({
                id: severity,
                label: SEVERITY_LABEL[severity],
                value,
                color: SEVERITY_TONE[severity],
              }))}
          />
          <p className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {bySeverity
              .filter((item) => item.value > 0)
              .map(({ severity, value }) => (
                <span key={severity} className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ background: SEVERITY_TONE[severity] }}
                  />
                  <span className="font-mono text-foreground tabular-nums">
                    {value}
                  </span>
                </span>
              ))}
          </p>
        </Tile>
        <Tile
          label="Rejected by the judge"
          value={run.rejected.length}
          onClick={() => onOpen("findings")}
        />
        <Tile
          label={run.source ? "Work orders" : "Proposed work orders"}
          value={run.workOrders.length}
          onClick={() => onOpen("work-orders")}
        />
        {/* Patches exist only for runs that read code. */}
        {security > 0 && run.source ? (
          <Tile
            label="Security fixes with a checked patch"
            value={patched}
            onClick={() => onOpen("findings")}
          >
            <p className="text-[11px] text-muted-foreground">
              of {security} security {security === 1 ? "issue" : "issues"}
            </p>
          </Tile>
        ) : (
          <Tile
            label="Findings filed by the agents"
            value={run.agents.reduce((sum, a) => sum + a.findings.length, 0)}
            onClick={() => onOpen("scoreboard")}
          />
        )}
      </div>
      <StageTime times={times} />
    </div>
  );
}
