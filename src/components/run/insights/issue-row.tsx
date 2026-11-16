"use client";

import {
  Boxes,
  ClipboardList,
  FileWarning,
  Route,
  ShieldAlert,
  Lightbulb,
  Wrench,
} from "lucide-react";

import { StateChip, type TrackedState } from "@/components/issues/state-chip";
import { AgentIcon, ProbableTag } from "@/components/run/badges";
import { SegmentedBar } from "@/components/tuff/progress-bar";
import { AGENTS } from "@/lib/agents";
import { FINDING_TYPE_LABEL, termsFor } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { IssueRow } from "@/lib/viz/insights";
import type { FindingType } from "@/server/engine/schema";

/*
 * One accepted issue as a row: what kind and how bad, where, the title and
 * a plain summary, one action, and on the right a small chart of its own:
 * which agents filed it, how the challenge round went, and its patch.
 */

const KIND_ICON: Record<FindingType, typeof ShieldAlert> = {
  security_vulnerability: ShieldAlert,
  missing_requirement: FileWarning,
  architecture_weakness: Boxes,
  unhandled_journey: Route,
};

export type RowAction = "fix" | "work-order" | "details";

export function IssueRowView({
  row,
  tracked,
  onAction,
  probable = false,
}: {
  row: IssueRow;
  /** A requirement run's risk: tagged Probable, "High risk". */
  probable?: boolean;
  /** Where the tracked issue is now, for a project run. */
  tracked?: TrackedState;
  onAction: (row: IssueRow, action: RowAction) => void;
}) {
  const Icon = KIND_ICON[row.type];
  const tone = SEVERITY_TONE[row.severity];
  const primary: {
    action: RowAction;
    label: string;
    icon: typeof Wrench;
  } | null =
    row.remediation?.status === "made"
      ? {
          action: "fix",
          label: probable ? "Suggested Change" : "View Fix",
          icon: probable ? Lightbulb : Wrench,
        }
      : row.workOrder
        ? {
            action: "work-order",
            label: probable ? "Proposed Work Order" : "Work Order",
            icon: ClipboardList,
          }
        : null;
  const challenged = row.challenge.support + row.challenge.dispute;

  return (
    <article
      className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_15rem]"
      data-testid="insight-row"
      data-severity={row.severity}
    >
      <div className="flex min-w-0 gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border text-muted-foreground"
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: tone }}
              />
              {termsFor(probable).severity(row.severity)}
            </span>
            {probable ? <ProbableTag /> : null}
            {tracked && tracked.state !== "open" ? (
              <StateChip tracked={tracked} />
            ) : null}
            <span>{FINDING_TYPE_LABEL[row.type]}</span>
            {row.where ? <span>· {row.where}</span> : null}
            {row.location ? (
              <span className="truncate font-mono text-[11px]">
                · {row.location.path}:{row.location.line}
              </span>
            ) : null}
          </p>
          <h3 className="mt-1.5 text-[15px] leading-snug font-medium">
            {row.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {row.summary}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {primary ? (
              <button
                type="button"
                onClick={() => onAction(row, primary.action)}
                data-testid="insight-primary"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs font-medium ring-1 ring-foreground/10 hover:bg-accent"
              >
                <primary.icon className="size-3.5" aria-hidden="true" />
                {primary.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onAction(row, "details")}
              data-testid="insight-details"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground"
            >
              Details
            </button>
          </div>
        </div>
      </div>

      {/* The row's own chart */}
      <div className="min-w-0 space-y-3 text-xs">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-muted-foreground">
            <span>{row.foundByCode ? "Found by" : "Filed by"}</span>
            <span className="font-mono text-foreground tabular-nums">
              {row.foundByCode ? "a code scan" : `${row.agents.length} of 5`}
            </span>
          </div>
          {row.foundByCode ? null : (
            <div className="flex gap-1.5" aria-label="Agents that filed it">
              {AGENTS.map((agent) => {
                const lit = row.agents.includes(agent.id);
                return (
                  <span
                    key={agent.id}
                    title={`${agent.name}${lit ? "" : ": did not file it"}`}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md ring-1",
                      lit
                        ? "bg-brand/15 text-foreground ring-brand/40"
                        : "text-muted-foreground/35 ring-foreground/10",
                    )}
                  >
                    <AgentIcon agentId={agent.id} className="size-3.5" />
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-muted-foreground">
            <span>Challenge</span>
            <span className="font-mono text-foreground tabular-nums">
              {challenged
                ? `${row.challenge.support} for · ${row.challenge.dispute} against`
                : "not challenged"}
            </span>
          </div>
          {challenged ? (
            <SegmentedBar
              label="Support and disputes from other agents"
              size="sm"
              max={challenged}
              segments={[
                {
                  id: "support",
                  label: "Supported",
                  value: row.challenge.support,
                  color: "var(--ok)",
                },
                {
                  id: "dispute",
                  label: "Disputed",
                  value: row.challenge.dispute,
                  color: "var(--sev-high)",
                },
              ].filter((segment) => segment.value > 0)}
            />
          ) : null}
        </div>

        {row.patch ? (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-muted-foreground">
              <span>Patch</span>
              <span className="font-mono tabular-nums">
                <span className="text-ok">+{row.patch.added}</span>{" "}
                <span className="text-sev-critical">−{row.patch.removed}</span>
                {row.remediation?.cwe ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {row.remediation.cwe.id}
                  </span>
                ) : null}
              </span>
            </div>
            <SegmentedBar
              label="Lines the patch adds and removes"
              size="sm"
              max={row.patch.added + row.patch.removed}
              segments={[
                {
                  id: "added",
                  label: "Added",
                  value: row.patch.added,
                  color: "var(--ok)",
                },
                {
                  id: "removed",
                  label: "Removed",
                  value: row.patch.removed,
                  color: "var(--sev-critical)",
                },
              ].filter((segment) => segment.value > 0)}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
