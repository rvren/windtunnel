import {
  FINDING_TYPE_LABEL,
  FINDING_TYPE_ORDER,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
} from "@/lib/labels";

import { placeOf } from "../engine/architecture";
import type {
  AgentId,
  Architecture,
  FindingType,
  RunRecord,
  Severity,
} from "../engine/schema";

/*
 * Turns one finished run into what the project cockpit shows. Pure: no
 * database, no model. Everything here is counted from the run; nothing is
 * made up.
 */

export interface CockpitIssue {
  id: string;
  title: string;
  summary: string;
  type: FindingType;
  severity: Severity;
  /** The workspace and component of the code it cites, when it cites any. */
  workspace: string | null;
  component: string | null;
  path: string | null;
  startLine: number | null;
  /** The agents whose findings were merged into it. */
  agents: AgentId[];
}

export interface SankeyNode {
  /** Unique in the chart: "source:web", "type:…", "severity:…". */
  id: string;
  column: 0 | 1 | 2;
  label: string;
  value: number;
  severity?: Severity;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  /** Set on the links that reach a severity. */
  severity?: Severity;
}

export interface CockpitComponent {
  id: string;
  name: string;
  kind: Architecture["components"][number]["kind"];
  workspace: string | null;
  description: string;
  issues: number;
  worst: Severity | null;
}

export interface Cockpit {
  runId: string;
  ranAt: string;
  sample: boolean;
  /** What the first column of the chart shows. */
  groupedBy: "workspace" | "component";
  workspaces: string[];
  totals: {
    issues: number;
    workOrders: number;
    bySeverity: Record<Severity, number>;
    byType: Record<FindingType, number>;
  };
  issues: CockpitIssue[];
  sankey: { nodes: SankeyNode[]; links: SankeyLink[] };
  components: CockpitComponent[];
  connections: Architecture["connections"];
}

/** The key for issues whose code is in no one workspace or component. */
export const UNPLACED = "-";

const worstOf = (severities: Severity[]): Severity | null =>
  SEVERITY_ORDER.find((severity) => severities.includes(severity)) ?? null;

export function buildCockpit(run: RunRecord): Cockpit {
  const architecture = run.source?.architecture;
  const workspaces = run.source?.workspaces?.map((item) => item.name) ?? [];
  const groupedBy = workspaces.length > 1 ? "workspace" : "component";
  const findings = new Map(
    run.agents.flatMap((agent) =>
      agent.findings.map((finding) => [finding.uid, finding] as const),
    ),
  );

  const issues: CockpitIssue[] = run.groups.map((group) => {
    const merged = group.findingIds.flatMap((uid) => findings.get(uid) ?? []);
    const cited = merged.find((finding) => finding.location);
    const place = cited
      ? placeOf(cited, workspaces, architecture)
      : { workspace: null, component: null };
    return {
      id: group.id,
      title: group.title,
      summary: group.summary,
      type: group.type,
      severity: group.severity,
      ...place,
      path: cited?.location?.path ?? null,
      startLine: cited?.location?.startLine ?? null,
      agents: [...new Set(merged.map((finding) => finding.agentId))],
    };
  });
  issues.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  const count = <K extends string>(
    keys: readonly K[],
    of: (issue: CockpitIssue) => K,
  ) =>
    Object.fromEntries(
      keys.map((key) => [
        key,
        issues.filter((issue) => of(issue) === key).length,
      ]),
    ) as Record<K, number>;

  // The chart: where the issue is → what kind it is → how bad it is.
  const componentName = new Map(
    architecture?.components.map((item) => [item.id, item.name]) ?? [],
  );
  const sourceOf = (issue: CockpitIssue) =>
    (groupedBy === "workspace" ? issue.workspace : issue.component) ?? UNPLACED;
  const sourceKeys = [
    ...(groupedBy === "workspace"
      ? workspaces
      : (architecture?.components.map((item) => item.id) ?? [])),
    UNPLACED,
  ].filter((key) => issues.some((issue) => sourceOf(issue) === key));

  const nodes: SankeyNode[] = [
    ...sourceKeys.map((key) => ({
      id: `source:${key}`,
      column: 0 as const,
      label:
        key === UNPLACED
          ? groupedBy === "workspace"
            ? "No one workspace"
            : "No one component"
          : groupedBy === "workspace"
            ? key
            : (componentName.get(key) ?? key),
      value: issues.filter((issue) => sourceOf(issue) === key).length,
    })),
    ...FINDING_TYPE_ORDER.map((type) => ({
      id: `type:${type}`,
      column: 1 as const,
      label: FINDING_TYPE_LABEL[type],
      value: issues.filter((issue) => issue.type === type).length,
    })),
    ...SEVERITY_ORDER.map((severity) => ({
      id: `severity:${severity}`,
      column: 2 as const,
      label: SEVERITY_LABEL[severity],
      value: issues.filter((issue) => issue.severity === severity).length,
      severity,
    })),
  ].filter((node) => node.value > 0);

  const links = new Map<string, SankeyLink>();
  const add = (source: string, target: string, severity?: Severity) => {
    const key = `${source}>${target}`;
    const link = links.get(key) ?? { source, target, value: 0, severity };
    link.value += 1;
    links.set(key, link);
  };
  for (const issue of issues) {
    add(`source:${sourceOf(issue)}`, `type:${issue.type}`);
    add(`type:${issue.type}`, `severity:${issue.severity}`, issue.severity);
  }

  return {
    runId: run.id,
    ranAt: run.createdAt,
    sample: run.sample,
    groupedBy,
    workspaces,
    totals: {
      issues: issues.length,
      workOrders: run.workOrders.length,
      bySeverity: count(SEVERITY_ORDER, (issue) => issue.severity),
      byType: count(FINDING_TYPE_ORDER, (issue) => issue.type),
    },
    issues,
    sankey: { nodes, links: [...links.values()] },
    components: (architecture?.components ?? []).map((component) => {
      const own = issues.filter((issue) => issue.component === component.id);
      return {
        id: component.id,
        name: component.name,
        kind: component.kind,
        workspace: component.workspace,
        description: component.description,
        issues: own.length,
        worst: worstOf(own.map((issue) => issue.severity)),
      };
    }),
    connections: architecture?.connections ?? [],
  };
}
