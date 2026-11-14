"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { X } from "lucide-react";

import { FadeIn, FadeInItem } from "@/components/motion";
import { Panel } from "@/components/panel";
import { AgentIcon, SeverityBadge } from "@/components/run/badges";
import { Button } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents";
import {
  FINDING_TYPE_LABEL,
  FINDING_TYPE_ORDER,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
} from "@/lib/labels";
import { StatGrid } from "@/components/tuff/stat-grid";
import { cn } from "@/lib/utils";
import { cockpitStats, type RunPoint } from "@/lib/viz/project";
import type { FindingType, Severity } from "@/server/engine/schema";
import {
  UNPLACED,
  type Cockpit as CockpitData,
  type CockpitIssue,
  type SankeyNode,
} from "@/server/projects/cockpit";

import { ArchitectureDiagram } from "./architecture-diagram";
import { PrivacyView } from "./privacy";
import { Sankey } from "./sankey";
import { SecurityView } from "./security";

/*
 * The cockpit of one project: the numbers, the flow of issues, the
 * architecture and the issues themselves, all from its latest finished run.
 * A number, a band's end or a part of the architecture filters the list.
 */

interface Filter {
  severity: Severity | null;
  type: FindingType | null;
  workspace: string | null;
  component: string | null;
}

const NO_FILTER: Filter = {
  severity: null,
  type: null,
  workspace: null,
  component: null,
};

const DOT: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
};

const AGENT_NAME = Object.fromEntries(
  AGENTS.map((agent) => [agent.id, agent.name]),
);

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-lg font-medium">{title}</h2>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Issue({ issue, runId }: { issue: CockpitIssue; runId: string }) {
  return (
    <details className="group px-4 py-3" data-testid="cockpit-issue">
      <summary className="flex cursor-pointer list-none items-start gap-3 outline-none [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            "mt-2 size-1.5 shrink-0 rounded-full",
            DOT[issue.severity],
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium group-open:text-foreground">
            {issue.title}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
            {FINDING_TYPE_LABEL[issue.type]}
            {issue.path
              ? ` · ${issue.path}${issue.startLine ? `:${issue.startLine}` : ""}`
              : ""}
          </span>
        </span>
        <SeverityBadge severity={issue.severity} />
      </summary>
      <div className="mt-3 space-y-3 pl-[1.125rem] text-sm">
        <p className="max-w-3xl leading-relaxed text-muted-foreground">
          {issue.summary}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {issue.agents.map((agent) => (
            <span key={agent} className="flex items-center gap-1.5">
              <AgentIcon agentId={agent} className="size-3.5" />
              {AGENT_NAME[agent]}
            </span>
          ))}
          <Link
            href={`/app/runs/${runId}`}
            data-testid="cockpit-issue-open-run"
            className="text-link underline-offset-4 hover:underline"
          >
            Open in the run
          </Link>
        </div>
      </div>
    </details>
  );
}

export function Cockpit({
  cockpit,
  earlier = [],
}: {
  cockpit: CockpitData;
  /** The project's earlier finished runs, oldest first, for change and trend. */
  earlier?: RunPoint[];
}) {
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const toggle = <K extends keyof Filter>(key: K, value: Filter[K]) =>
    setFilter((current) => ({
      ...current,
      [key]: current[key] === value ? null : value,
    }));

  const byWorkspace = cockpit.groupedBy === "workspace";
  const componentName = new Map(
    cockpit.components.map((item) => [item.id, item.name]),
  );
  const placed = (value: string | null) => value ?? UNPLACED;
  const shown = cockpit.issues.filter(
    (issue) =>
      (!filter.severity || issue.severity === filter.severity) &&
      (!filter.type || issue.type === filter.type) &&
      (!filter.workspace || placed(issue.workspace) === filter.workspace) &&
      (!filter.component || placed(issue.component) === filter.component),
  );

  function selectNode(node: SankeyNode) {
    const kind = node.id.slice(0, node.id.indexOf(":"));
    const key = node.id.slice(kind.length + 1);
    if (kind === "severity") toggle("severity", key as Severity);
    else if (kind === "type") toggle("type", key as FindingType);
    else toggle(byWorkspace ? "workspace" : "component", key);
  }
  const selectedNodes = [
    filter.severity ? `severity:${filter.severity}` : null,
    filter.type ? `type:${filter.type}` : null,
    byWorkspace && filter.workspace ? `source:${filter.workspace}` : null,
    !byWorkspace && filter.component ? `source:${filter.component}` : null,
  ].filter((id): id is string => id !== null);

  const chips = [
    filter.severity
      ? { key: "severity" as const, label: SEVERITY_LABEL[filter.severity] }
      : null,
    filter.type
      ? { key: "type" as const, label: FINDING_TYPE_LABEL[filter.type] }
      : null,
    filter.workspace
      ? {
          key: "workspace" as const,
          label:
            filter.workspace === UNPLACED
              ? "No one workspace"
              : filter.workspace,
        }
      : null,
    filter.component
      ? {
          key: "component" as const,
          label:
            filter.component === UNPLACED
              ? "No one component"
              : (componentName.get(filter.component) ?? filter.component),
        }
      : null,
  ].filter((chip) => chip !== null);

  if (cockpit.totals.issues === 0 && cockpit.components.length === 0) {
    return (
      <Panel className="px-6 py-12 text-center" data-testid="cockpit-clean">
        <h2 className="text-lg font-medium">The last run found no issues</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Nothing the agents filed was accepted by the judge.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-10" data-testid="cockpit">
      {/* The numbers. Each severity is a filter. */}
      <FadeIn data-testid="cockpit-stats">
        <StatGrid
          className="max-w-none"
          gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          sparklines
          data={cockpitStats(cockpit, earlier).map((stat) => ({
            ...stat,
            active: filter.severity === stat.id,
          }))}
          onSelect={(stat) => {
            if ((SEVERITY_ORDER as readonly string[]).includes(stat.id)) {
              toggle("severity", stat.id as Severity);
            }
          }}
        />
      </FadeIn>

      {cockpit.totals.issues > 0 ? (
        <FadeIn delay={0.05}>
          <SectionTitle
            title="Where the issues are"
            note="The width of a band is the number of issues. Select a name to filter the list."
          />
          <Panel className="px-4 py-5 sm:px-6">
            <Sankey
              nodes={cockpit.sankey.nodes}
              links={cockpit.sankey.links}
              heading={[
                byWorkspace ? "Workspace" : "Component",
                "Kind",
                "Severity",
              ]}
              selected={selectedNodes}
              onSelect={selectNode}
            />
          </Panel>
        </FadeIn>
      ) : null}

      {cockpit.components.length > 0 ? (
        <FadeIn delay={0.1}>
          <SectionTitle
            title="Architecture"
            note="Read from the code by the run. A number is the issues in that part."
          />
          <Panel className="px-4 py-6 sm:px-6">
            <ArchitectureDiagram
              components={cockpit.components}
              connections={cockpit.connections}
              showWorkspace={byWorkspace}
              selected={filter.component}
              onSelect={(id) => toggle("component", id)}
            />
          </Panel>
        </FadeIn>
      ) : null}

      <FadeIn delay={0.15}>
        <SectionTitle
          title="Issues"
          note={
            shown.length === cockpit.issues.length
              ? `${cockpit.issues.length} accepted by the judge`
              : `${shown.length} of ${cockpit.issues.length}`
          }
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {FINDING_TYPE_ORDER.filter(
            (type) => cockpit.totals.byType[type] > 0,
          ).map((type) => (
            <Button
              key={type}
              type="button"
              size="sm"
              variant={filter.type === type ? "secondary" : "outline"}
              aria-pressed={filter.type === type}
              data-testid={`cockpit-type-${type}`}
              onClick={() => toggle("type", type)}
            >
              {FINDING_TYPE_LABEL[type]}
              <span className="font-mono text-xs text-muted-foreground">
                {cockpit.totals.byType[type]}
              </span>
            </Button>
          ))}
          {chips
            .filter((chip) => chip.key !== "type")
            .map((chip) => (
              <Button
                key={chip.key}
                type="button"
                size="sm"
                variant="secondary"
                data-testid={`cockpit-filter-${chip.key}`}
                aria-label={`Remove the filter ${chip.label}`}
                onClick={() => setFilter({ ...filter, [chip.key]: null })}
              >
                {chip.label}
                <X />
              </Button>
            ))}
          {chips.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="link"
              data-testid="cockpit-filter-clear"
              onClick={() => setFilter(NO_FILTER)}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <Panel>
          {shown.length > 0 ? (
            <ul className="divide-y" data-testid="cockpit-issues">
              <AnimatePresence initial={false}>
                {shown.map((issue) => (
                  <FadeInItem key={issue.id}>
                    <Issue issue={issue} runId={cockpit.runId} />
                  </FadeInItem>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p
              className="px-4 py-10 text-center text-sm text-muted-foreground"
              data-testid="cockpit-issues-empty"
            >
              No issue matches these filters.
            </p>
          )}
        </Panel>
      </FadeIn>
      <SecurityView issues={cockpit.issues} />
      {cockpit.privacy ? <PrivacyView privacy={cockpit.privacy} /> : null}
    </div>
  );
}
