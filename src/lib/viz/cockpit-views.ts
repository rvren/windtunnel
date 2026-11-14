import {
  FINDING_TYPE_LABEL,
  FINDING_TYPE_ORDER,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
} from "@/lib/labels";
import type { DataSink, FindingType, Severity } from "@/server/engine/schema";
import type { Cockpit, CockpitIssue } from "@/server/projects/cockpit";
import { UNPLACED } from "@/server/projects/cockpit";

/*
 * The cockpit's canvas views, as data. Each view is three columns: sources
 * on the left, hubs in the middle, groups on the right that list a few
 * items. Bands run source → hub → group, one per colour, so a band is a
 * bundle of coloured strands. Pure; every number is counted from the run.
 */

/** What a click on a node does to the issues list. */
export type CockpitFilterKey =
  "severity" | "type" | "workspace" | "component" | "owasp" | "patched";

export interface FlowFilter {
  key: CockpitFilterKey;
  value: string;
}

export interface FlowNodeData {
  id: string;
  label: string;
  value: number;
  /** A short second line, e.g. "6 issues". */
  sub?: string;
  /** Any CSS colour, for the node's mark. */
  tone?: string;
  filter?: FlowFilter;
}

export interface FlowLeaf {
  id: string;
  label: string;
  /** Mono text on the right, e.g. a file and line. */
  meta?: string;
  tone?: string;
  /** Opens this, e.g. the issue in its run. */
  href?: string;
}

export interface FlowGroup extends FlowNodeData {
  leaves: FlowLeaf[];
  /** Items not listed: "View all" shows them. */
  more: number;
}

export interface FlowBand {
  source: string;
  target: string;
  value: number;
  /** Any CSS colour: the colour of this band's strands. */
  tone: string;
}

export interface FlowView {
  /** The name of each column, left to right. */
  heading: [string, string, string];
  sources: FlowNodeData[];
  hubs: FlowNodeData[];
  groups: FlowGroup[];
  bands: FlowBand[];
}

export const SEVERITY_TONE: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

const LEAVES = 3;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Adds one to the band source → target in this colour. */
function counter() {
  const bands = new Map<string, FlowBand>();
  return {
    add(source: string, target: string, tone: string, value = 1) {
      const key = `${source}>${target}>${tone}`;
      const band = bands.get(key) ?? { source, target, value: 0, tone };
      band.value += value;
      bands.set(key, band);
    },
    all: () => [...bands.values()],
  };
}

const issueLeaf = (issue: CockpitIssue, runId: string): FlowLeaf => ({
  id: issue.id,
  label: issue.title,
  meta: issue.path
    ? `${issue.path}${issue.startLine ? `:${issue.startLine}` : ""}`
    : undefined,
  tone: SEVERITY_TONE[issue.severity],
  href: `/app/runs/${runId}`,
});

/** Severities on the right, each listing its first issues. */
function severityGroups(
  issues: CockpitIssue[],
  runId: string,
  id: (severity: Severity) => string,
): FlowGroup[] {
  return SEVERITY_ORDER.flatMap((severity) => {
    const own = issues.filter((issue) => issue.severity === severity);
    if (own.length === 0) return [];
    return [
      {
        id: id(severity),
        label: SEVERITY_LABEL[severity],
        value: own.length,
        sub: plural(own.length, "issue"),
        tone: SEVERITY_TONE[severity],
        filter: { key: "severity", value: severity },
        leaves: own.slice(0, LEAVES).map((issue) => issueLeaf(issue, runId)),
        more: Math.max(0, own.length - LEAVES),
      },
    ];
  });
}

/** Where the issues are → what kind they are → how bad they are. */
export function issueFlowView(cockpit: Cockpit): FlowView | null {
  if (cockpit.issues.length === 0) return null;
  const byWorkspace = cockpit.groupedBy === "workspace";
  const name = new Map(cockpit.components.map((c) => [c.id, c.name]));
  const placeOf = (issue: CockpitIssue) =>
    (byWorkspace ? issue.workspace : issue.component) ?? UNPLACED;
  const places = [...new Set(cockpit.issues.map(placeOf))].sort((a, b) =>
    a === UNPLACED ? 1 : b === UNPLACED ? -1 : 0,
  );
  const bands = counter();
  for (const issue of cockpit.issues) {
    const tone = SEVERITY_TONE[issue.severity];
    bands.add(`source:${placeOf(issue)}`, `hub:${issue.type}`, tone);
    bands.add(`hub:${issue.type}`, `group:${issue.severity}`, tone);
  }
  return {
    heading: [byWorkspace ? "Workspaces" : "Components", "Kinds", "Severity"],
    sources: places.map((place) => {
      const value = cockpit.issues.filter((i) => placeOf(i) === place).length;
      return {
        id: `source:${place}`,
        label:
          place === UNPLACED
            ? byWorkspace
              ? "No one workspace"
              : "No one component"
            : byWorkspace
              ? place
              : (name.get(place) ?? place),
        value,
        sub: plural(value, "issue"),
        filter: {
          key: byWorkspace ? "workspace" : "component",
          value: place,
        },
      };
    }),
    hubs: FINDING_TYPE_ORDER.flatMap((type: FindingType) => {
      const value = cockpit.totals.byType[type];
      return value
        ? [
            {
              id: `hub:${type}`,
              label: FINDING_TYPE_LABEL[type],
              value,
              sub: plural(value, "issue"),
              filter: { key: "type" as const, value: type },
            },
          ]
        : [];
    }),
    groups: severityGroups(cockpit.issues, cockpit.runId, (s) => `group:${s}`),
    bands: bands.all(),
  };
}

const SINKS: { id: DataSink; label: string; tone: string }[] = [
  { id: "log", label: "Logs", tone: "var(--sev-critical)" },
  { id: "outside", label: "Outside calls", tone: "var(--sev-high)" },
  { id: "response", label: "Responses", tone: "var(--sev-medium)" },
  { id: "storage", label: "Storage", tone: "var(--sev-low)" },
];

/** Personal data → where it goes → which workspace does it. */
export function dataFlowView(cockpit: Cockpit): FlowView | null {
  const privacy = cockpit.privacy;
  if (!privacy || privacy.flows.length === 0) return null;
  const tone = new Map(SINKS.map((sink) => [sink.id, sink.tone]));
  const bands = counter();
  for (const flow of privacy.flows) {
    const color = tone.get(flow.sink)!;
    bands.add(
      `source:${flow.category}`,
      `hub:${flow.sink}`,
      color,
      flow.places,
    );
    bands.add(`hub:${flow.sink}`, `group:${flow.area}`, color, flow.places);
  }
  const flows = privacy.flows;
  const sum = (pick: (flow: (typeof flows)[number]) => boolean) =>
    flows.filter(pick).reduce((total, flow) => total + flow.places, 0);
  const workspaces = [...new Set(privacy.flows.map((flow) => flow.area))];
  return {
    heading: ["Personal data", "Where it goes", "Where in the code"],
    sources: privacy.categories
      .filter((item) => privacy.flows.some((f) => f.category === item.category))
      .map((item) => ({
        id: `source:${item.category}`,
        label: item.category,
        // Sized by what reaches a sink, so its bands fill it.
        value: sum((flow) => flow.category === item.category),
        sub: `${plural(item.places, "place")} in the code`,
      })),
    hubs: SINKS.flatMap((sink) => {
      const value = sum((flow) => flow.sink === sink.id);
      return value
        ? [
            {
              id: `hub:${sink.id}`,
              label: sink.label,
              value,
              sub: plural(value, "place"),
              tone: sink.tone,
            },
          ]
        : [];
    }),
    groups: workspaces.map((key) => {
      const value = sum((flow) => flow.area === key);
      const places = privacy.exposed.filter((place) => place.area === key);
      return {
        id: `group:${key}`,
        label: key,
        value,
        sub: plural(value, "place"),
        leaves: places.map((place) => ({
          id: `${place.path}:${place.line}`,
          label: place.path.split("/").pop() ?? place.path,
          meta: `line ${place.line}`,
          tone: "var(--sev-critical)",
        })),
        more: 0,
      };
    }),
    bands: bands.all(),
  };
}

export const NOT_MAPPED = "not-mapped";

/** Security issues by OWASP category → whether a patch is ready → severity. */
export function securityView(cockpit: Cockpit): FlowView | null {
  const security = cockpit.issues.filter(
    (issue) => issue.type === "security_vulnerability",
  );
  if (security.length === 0) return null;
  const owaspOf = (issue: CockpitIssue) =>
    issue.remediation?.owasp?.id ?? NOT_MAPPED;
  const patched = (issue: CockpitIssue) =>
    (issue.remediation?.edits.length ?? 0) > 0;
  const names = new Map(
    security.flatMap((issue) =>
      issue.remediation?.owasp
        ? [[issue.remediation.owasp.id, issue.remediation.owasp.name] as const]
        : [],
    ),
  );
  const categories = [...new Set(security.map(owaspOf))].sort((a, b) =>
    a === NOT_MAPPED ? 1 : b === NOT_MAPPED ? -1 : a.localeCompare(b),
  );
  const bands = counter();
  for (const issue of security) {
    const tone = SEVERITY_TONE[issue.severity];
    const hub = patched(issue) ? "hub:yes" : "hub:no";
    bands.add(`source:${owaspOf(issue)}`, hub, tone);
    bands.add(hub, `group:${issue.severity}`, tone);
  }
  const ready = security.filter(patched).length;
  return {
    heading: ["OWASP Top 10", "Patch", "Severity"],
    sources: categories.map((id) => {
      const value = security.filter((issue) => owaspOf(issue) === id).length;
      return {
        id: `source:${id}`,
        label:
          id === NOT_MAPPED
            ? "Not mapped"
            : `${id.slice(0, 3)} ${names.get(id) ?? ""}`.trim(),
        value,
        sub: plural(value, "issue"),
        filter: { key: "owasp", value: id },
      };
    }),
    hubs: [
      ...(ready
        ? [
            {
              id: "hub:yes",
              label: "Patch ready",
              value: ready,
              sub: "checked against the code",
              tone: "var(--ok)",
              filter: { key: "patched" as const, value: "yes" },
            },
          ]
        : []),
      ...(security.length - ready
        ? [
            {
              id: "hub:no",
              label: "No patch",
              value: security.length - ready,
              sub: "steps only",
              filter: { key: "patched" as const, value: "no" },
            },
          ]
        : []),
    ],
    groups: severityGroups(security, cockpit.runId, (s) => `group:${s}`),
    bands: bands.all(),
  };
}
