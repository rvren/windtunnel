import {
  FINDING_TYPE_LABEL,
  FINDING_TYPE_ORDER,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
} from "@/lib/labels";

import { componentOf, workspaceOf } from "../engine/architecture";
import type {
  AgentId,
  DataSink,
  PiiCategory,
  RemediationRecord,
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
  /** How to fix it, for a security finding that has one. */
  remediation: RemediationRecord | null;
  /** True when code found it (a secret), not an agent. */
  foundByCode: boolean;
}

/** Where a project's code handles personal data and holds secrets. */
export interface CockpitPrivacy {
  categories: {
    category: PiiCategory;
    places: number;
    workspaces: string[];
    /** How many places reach each sink. */
    sinks: Record<DataSink, number>;
    /** Places that reach a log, an outside call or a response first. */
    examples: { path: string; line: number; sinks: DataSink[] }[];
  }[];
  /** How many places reach a log or an outside call (each counted once). */
  exposedPlaces: number;
  secrets: {
    kind: string;
    path: string;
    line: number;
    workspace: string | null;
  }[];
  filesScanned: number;
  truncated: boolean;
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
  /** Drawn from a requirement run, which reads no code. */
  fromRequirement: boolean;
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
  /** Null for a run that read no code. */
  privacy: CockpitPrivacy | null;
}

/** The key for issues whose code is in no one workspace or component. */
export const UNPLACED = "-";

/** What the first column calls the issues that sit in no one place. */
export function unplacedLabel(
  cockpit: Pick<Cockpit, "fromRequirement" | "groupedBy">,
): string {
  if (cockpit.fromRequirement) return "The requirement";
  return cockpit.groupedBy === "workspace"
    ? "No one workspace"
    : "No one component";
}

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
    // A finding's own place, or, for one found by code, the group's.
    const location =
      merged.find((finding) => finding.location)?.location ?? group.location;
    const place = location
      ? {
          workspace: workspaceOf(location.path, workspaces),
          component: componentOf(location.path, architecture),
        }
      : { workspace: null, component: null };
    return {
      id: group.id,
      title: group.title,
      summary: group.summary,
      type: group.type,
      severity: group.severity,
      ...place,
      path: location?.path ?? null,
      startLine: location?.startLine ?? null,
      agents: [...new Set(merged.map((finding) => finding.agentId))],
      remediation: run.remediations?.[group.id] ?? null,
      foundByCode: group.foundBy === "code",
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
          ? unplacedLabel({ fromRequirement: !run.source, groupedBy })
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

  const inventory = run.inventory;
  const SINKS: DataSink[] = ["log", "outside", "storage", "response"];
  const privacy: CockpitPrivacy | null = inventory
    ? {
        categories: [...new Set(inventory.pii.map((item) => item.category))]
          .map((category) => {
            const places = inventory.pii.filter(
              (item) => item.category === category,
            );
            return {
              category,
              places: places.length,
              workspaces: [
                ...new Set(
                  places.flatMap(
                    (item) => workspaceOf(item.path, workspaces) ?? [],
                  ),
                ),
              ],
              sinks: Object.fromEntries(
                SINKS.map((sink) => [
                  sink,
                  places.filter((item) => item.sinks.includes(sink)).length,
                ]),
              ) as Record<DataSink, number>,
              examples: places
                .filter((item) => item.sinks.some((sink) => sink !== "storage"))
                .slice(0, 5)
                .map(({ path, line, sinks }) => ({ path, line, sinks })),
            };
          })
          .sort((a, b) => b.places - a.places),
        exposedPlaces: inventory.pii.filter((item) =>
          item.sinks.some((sink) => sink === "log" || sink === "outside"),
        ).length,
        secrets: inventory.secrets.map(({ kind, path, line }) => ({
          kind,
          path,
          line,
          workspace: workspaceOf(path, workspaces),
        })),
        filesScanned: inventory.filesScanned,
        truncated: inventory.truncated,
      }
    : null;

  return {
    runId: run.id,
    fromRequirement: !run.source,
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
    privacy,
  };
}
