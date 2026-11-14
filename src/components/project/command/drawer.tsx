"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ChevronRight } from "lucide-react";

import { AgentIcon, SeverityBadge } from "@/components/run/badges";
import { Remediation } from "@/components/run/remediation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AGENTS } from "@/lib/agents";
import { FINDING_TYPE_LABEL } from "@/lib/labels";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { Cockpit, CockpitIssue } from "@/server/projects/cockpit";

import { PrivacyView } from "../privacy";
import { SecurityView } from "../security";

/*
 * The drill-down of focus mode: a wide drawer with the full detail of what
 * was picked. A list of issues opens one issue in place; Back returns to
 * the list. Everything here is the run's own data.
 */

export type Drill =
  | { kind: "issues"; title: string; note?: string; issues: CockpitIssue[] }
  | { kind: "issue"; issue: CockpitIssue; from?: Drill }
  | { kind: "security" }
  | { kind: "privacy" };

const AGENT_NAME = Object.fromEntries(AGENTS.map((a) => [a.id, a.name]));

function IssueRow({
  issue,
  onOpen,
}: {
  issue: CockpitIssue;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid="drawer-issue-row"
        className="group flex w-full items-start gap-3 rounded-tile px-3 py-3 text-left hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className="mt-1 h-8 w-0.5 shrink-0 rounded-full"
          style={{ background: SEVERITY_TONE[issue.severity] }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{issue.title}</span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
            {FINDING_TYPE_LABEL[issue.type]}
            {issue.path
              ? ` · ${issue.path}${issue.startLine ? `:${issue.startLine}` : ""}`
              : ""}
          </span>
        </span>
        <SeverityBadge severity={issue.severity} />
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

function IssueDetail({ issue, runId }: { issue: CockpitIssue; runId: string }) {
  return (
    <div className="space-y-6" data-testid="drawer-issue">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-tile bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">Severity</dt>
          <dd className="mt-1">
            <SeverityBadge severity={issue.severity} />
          </dd>
        </div>
        <div className="rounded-tile bg-muted/50 p-3 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Kind</dt>
          <dd className="mt-1">{FINDING_TYPE_LABEL[issue.type]}</dd>
        </div>
        <div className="rounded-tile bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">Where</dt>
          <dd className="mt-1 truncate">
            {issue.workspace ?? issue.component ?? "—"}
          </dd>
        </div>
      </dl>

      {issue.path ? (
        <p className="font-mono text-xs text-muted-foreground">
          {issue.path}
          {issue.startLine ? `:${issue.startLine}` : ""}
        </p>
      ) : null}

      <p className="max-w-prose text-sm leading-relaxed">{issue.summary}</p>

      <div className="space-y-2">
        <h3 className="text-xs tracking-[0.1em] text-muted-foreground uppercase">
          {issue.foundByCode ? "Found by" : "Filed by"}
        </h3>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {issue.foundByCode ? (
            <span>A scan of the code</span>
          ) : (
            issue.agents.map((agent) => (
              <span key={agent} className="flex items-center gap-1.5">
                <AgentIcon agentId={agent} className="size-4" />
                {AGENT_NAME[agent]}
              </span>
            ))
          )}
        </div>
      </div>

      {issue.remediation ? <Remediation record={issue.remediation} /> : null}

      <Link
        href={`/app/runs/${runId}`}
        className="inline-flex items-center gap-1 text-sm text-link hover:underline"
      >
        Open In The Run
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function CockpitDrawer({
  drill,
  cockpit,
  onDrill,
  onClose,
}: {
  drill: Drill | null;
  cockpit: Cockpit;
  onDrill: (drill: Drill) => void;
  onClose: () => void;
}) {
  const title =
    drill?.kind === "issues"
      ? drill.title
      : drill?.kind === "issue"
        ? drill.issue.title
        : drill?.kind === "security"
          ? "Security"
          : drill?.kind === "privacy"
            ? "Data and privacy"
            : "";
  const note =
    drill?.kind === "issues"
      ? (drill.note ??
        `${drill.issues.length} ${drill.issues.length === 1 ? "issue" : "issues"}`)
      : drill?.kind === "issue"
        ? null
        : drill?.kind === "security"
          ? "Every security issue with its fix: steps, CWE and OWASP, and a checked patch."
          : drill?.kind === "privacy"
            ? "Personal data and secrets found in the code."
            : null;

  return (
    <Sheet open={drill !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:sm:max-w-2xl"
        data-testid="cockpit-drawer"
      >
        <SheetHeader className="gap-1 border-b px-6 pt-6 pb-4">
          {drill?.kind === "issue" && drill.from ? (
            <button
              type="button"
              onClick={() => onDrill(drill.from!)}
              className="mb-2 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              data-testid="drawer-back"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </button>
          ) : null}
          <SheetTitle className="pr-8 text-lg leading-snug">{title}</SheetTitle>
          {note ? <SheetDescription>{note}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {drill?.kind === "issues" ? (
            drill.issues.length > 0 ? (
              <ul className="-mx-3 space-y-0.5">
                {drill.issues.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    onOpen={() =>
                      onDrill({ kind: "issue", issue, from: drill })
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No issue matches these filters.
              </p>
            )
          ) : drill?.kind === "issue" ? (
            <IssueDetail issue={drill.issue} runId={cockpit.runId} />
          ) : drill?.kind === "security" ? (
            <SecurityView issues={cockpit.issues} />
          ) : drill?.kind === "privacy" && cockpit.privacy ? (
            <PrivacyView privacy={cockpit.privacy} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
