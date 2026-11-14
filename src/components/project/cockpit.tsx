"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { cn } from "@/lib/utils";
import {
  NOT_MAPPED,
  SEVERITY_TONE,
  issueFlowView,
  securityView,
  type FlowFilter,
  type FlowView,
} from "@/lib/viz/cockpit-views";
import type { RunPoint } from "@/lib/viz/project";
import type { FindingType, Severity } from "@/server/engine/schema";
import {
  UNPLACED,
  type Cockpit as CockpitData,
  type CockpitIssue,
} from "@/server/projects/cockpit";

import { ArchitectureDiagram } from "./architecture-diagram";
import { DockCards, SummaryCards, type Delivered } from "./command/cards";
import { FlowCanvas, FlowLists } from "./command/flow-canvas";
import { FitBox } from "./command/fit-box";
import { Stage } from "./command/stage";
import { PrivacyView } from "./privacy";
import { SecurityView } from "./security";

/*
 * The cockpit of one project, laid out as a command center: a header with a
 * view switcher, one canvas that shows the picked view (issue flow,
 * architecture, security), the card dock, then the issues.
 * Anything picked on the canvas or a card filters the list. All from the
 * project's latest finished run.
 */

interface Filter {
  severity: Severity | null;
  type: FindingType | null;
  workspace: string | null;
  component: string | null;
  owasp: string | null;
  patched: "yes" | "no" | null;
}

const NO_FILTER: Filter = {
  severity: null,
  type: null,
  workspace: null,
  component: null,
  owasp: null,
  patched: null,
};

type ViewId = "flow" | "architecture" | "security";

const SEVERITY_LEGEND = SEVERITY_ORDER.map((severity) => ({
  severity,
  label: SEVERITY_LABEL[severity],
  tone: SEVERITY_TONE[severity],
}));

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
  delivered = null,
}: {
  cockpit: CockpitData;
  /** The project's earlier finished runs, oldest first, for change and trend. */
  earlier?: RunPoint[];
  /** Work orders sent to 8090 for this run; null when the project is not linked. */
  delivered?: Delivered | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const toggle = <K extends keyof Filter>(key: K, value: Filter[K]) =>
    setFilter((current) => ({
      ...current,
      [key]: current[key] === value ? null : value,
    }));
  const pick = (choice: FlowFilter) =>
    toggle(choice.key, choice.value as never);

  // The views this run can show, in the switcher's order.
  const flows: Record<Exclude<ViewId, "architecture">, FlowView | null> = {
    flow: issueFlowView(cockpit),
    security: securityView(cockpit),
  };
  const views = (
    [
      { value: "flow", label: "Issue flow", on: Boolean(flows.flow) },
      {
        value: "architecture",
        label: "Architecture",
        on: cockpit.components.length > 0,
      },
      { value: "security", label: "Security", on: Boolean(flows.security) },
    ] as const
  ).filter((view) => view.on);
  const asked = params.get("view") as ViewId | null;
  const view: ViewId | null =
    views.find((item) => item.value === asked)?.value ??
    views[0]?.value ??
    null;
  const setView = (next: ViewId) => {
    const query = new URLSearchParams(params.toString());
    query.set("view", next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const byWorkspace = cockpit.groupedBy === "workspace";
  const componentName = new Map(
    cockpit.components.map((item) => [item.id, item.name]),
  );
  const placed = (value: string | null) => value ?? UNPLACED;
  const owaspOf = (issue: CockpitIssue) =>
    issue.remediation?.owasp?.id ?? NOT_MAPPED;
  const hasPatch = (issue: CockpitIssue) =>
    (issue.remediation?.edits.length ?? 0) > 0;
  const shown = cockpit.issues.filter(
    (issue) =>
      (!filter.severity || issue.severity === filter.severity) &&
      (!filter.type || issue.type === filter.type) &&
      (!filter.workspace || placed(issue.workspace) === filter.workspace) &&
      (!filter.component || placed(issue.component) === filter.component) &&
      (!filter.owasp ||
        (issue.type === "security_vulnerability" &&
          owaspOf(issue) === filter.owasp)) &&
      (!filter.patched ||
        (issue.type === "security_vulnerability" &&
          hasPatch(issue) === (filter.patched === "yes"))),
  );

  // The nodes on the canvas that match the filters, to light them.
  const selectedNodes = [
    filter.severity ? `group:${filter.severity}` : null,
    filter.type ? `hub:${filter.type}` : null,
    filter.workspace ? `source:${filter.workspace}` : null,
    filter.component ? `source:${filter.component}` : null,
    filter.owasp ? `source:${filter.owasp}` : null,
    filter.patched ? `hub:${filter.patched}` : null,
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
    filter.owasp
      ? {
          key: "owasp" as const,
          label:
            filter.owasp === NOT_MAPPED
              ? "Not mapped to OWASP"
              : `OWASP ${filter.owasp.slice(0, 3)}`,
        }
      : null,
    filter.patched
      ? {
          key: "patched" as const,
          label: filter.patched === "yes" ? "Patch ready" : "No patch",
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

  const secrets = cockpit.privacy?.secrets ?? [];
  const flowView = view && view !== "architecture" ? flows[view] : null;
  const onFlowPick = (choice: FlowFilter) => {
    pick(choice);
  };

  return (
    <div className="space-y-6" data-testid="cockpit">
      {/* The stage: one fixed frame for every view, with overlays. */}
      {view ? (
        <FadeIn>
          <Stage
            views={views.map(({ value, label }) => ({ value, label }))}
            view={view}
            onView={setView}
            title={views.find((item) => item.value === view)?.label ?? ""}
            note={
              view === "architecture"
                ? "The parts of the application as the run read them, and what calls what."
                : (flowView?.note ?? "")
            }
            legend={
              view === "architecture"
                ? SEVERITY_LEGEND.filter(
                    (item) => cockpit.totals.bySeverity[item.severity] > 0,
                  )
                : (flowView?.legend ?? [])
            }
            chips={chips}
            onRemoveChip={(key) => setFilter({ ...filter, [key]: null })}
            onClear={() => setFilter(NO_FILTER)}
            secrets={
              view === "security" ? secrets.length : 0
            }
            onSecrets={() => toggle("severity", "critical")}
            runId={cockpit.runId}
            dock={
              <DockCards
                cockpit={cockpit}
                earlier={earlier}
                delivered={delivered}
                selectedSeverity={filter.severity}
                onPick={pick}
              />
            }
            renderView={(box) =>
              view === "architecture" ? (
                <FitBox width={box.width} height={box.height}>
                  <ArchitectureDiagram
                    components={cockpit.components}
                    connections={cockpit.connections}
                    showWorkspace={byWorkspace}
                    selected={filter.component}
                    onSelect={(id) => toggle("component", id)}
                  />
                </FitBox>
              ) : flowView ? (
                <FlowCanvas
                  view={flowView}
                  width={box.width}
                  height={box.height}
                  selected={selectedNodes}
                  onPick={onFlowPick}
                />
              ) : null
            }
            renderNarrow={() => (
              <div className="space-y-6">
                {view === "architecture" ? (
                  <ArchitectureDiagram
                    components={cockpit.components}
                    connections={cockpit.connections}
                    showWorkspace={byWorkspace}
                    selected={filter.component}
                    onSelect={(id) => toggle("component", id)}
                  />
                ) : flowView ? (
                  <FlowLists
                    view={flowView}
                    selected={selectedNodes}
                    onPick={onFlowPick}
                  />
                ) : null}
                <SummaryCards
                  cockpit={cockpit}
                  earlier={earlier}
                  delivered={delivered}
                  selectedSeverity={filter.severity}
                  onPick={pick}
                />
              </div>
            )}
          />
        </FadeIn>
      ) : null}

      <FadeIn delay={0.15} className="pt-4">
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
