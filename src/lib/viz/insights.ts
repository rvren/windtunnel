import { AGENT_IDS, agentById, type AgentId } from "@/lib/agents";
import {
  FINDING_TYPE_LABEL,
  FINDING_TYPE_ORDER,
  SEVERITY_ORDER,
} from "@/lib/labels";
import { componentOf, workspaceOf } from "@/server/engine/architecture";
import type {
  Challenge,
  Finding,
  FindingType,
  RemediationRecord,
  RunRecord,
  Severity,
  WorkOrder,
} from "@/server/engine/schema";

/*
 * A finished run's accepted issues as rows for the insights list, with
 * everything a row and its drawer show: where it is, which agents filed it,
 * how the challenge round went, its fix and its work order. Pure; every
 * number is counted from the run.
 */

export interface IssueRow {
  id: string;
  title: string;
  summary: string;
  type: FindingType;
  severity: Severity;
  /** The workspace or component the cited code is in, when it cites any. */
  where: string | null;
  location: { path: string; line: number } | null;
  /** The agents whose findings were merged into this issue, in team order. */
  agents: AgentId[];
  /** What the other agents said about its findings in the challenge round. */
  challenge: { support: number; dispute: number };
  /** The checked patch's size, for a security issue that has one. */
  patch: { added: number; removed: number; files: number } | null;
  remediation: RemediationRecord | null;
  /** The work order that covers this issue, if one does. */
  workOrder: WorkOrder | null;
  /** The merged findings, with their agent's name. */
  findings: (Finding & { agentName: string })[];
  /** The challenge comments on its findings. */
  comments: (Challenge & { agentName: string })[];
  /** True when code found it (a secret), not an agent. */
  foundByCode: boolean;
}

const agentName = (id: AgentId) => agentById(id)?.name ?? id;

export function issueRows(run: RunRecord): IssueRow[] {
  const findings = new Map(
    run.agents.flatMap((agent) =>
      agent.findings.map((finding) => [finding.uid, finding] as const),
    ),
  );
  const workspaces = run.source?.workspaces?.map((item) => item.name) ?? [];
  const architecture = run.source?.architecture;
  const componentName = new Map(
    architecture?.components.map((item) => [item.id, item.name]) ?? [],
  );

  return run.groups.map((group) => {
    const merged = group.findingIds.flatMap((uid) => {
      const finding = findings.get(uid);
      return finding
        ? [{ ...finding, agentName: agentName(finding.agentId) }]
        : [];
    });
    const cited =
      merged.find((finding) => finding.location)?.location ?? group.location;
    const workspace =
      cited && workspaces.length > 1
        ? workspaceOf(cited.path, workspaces)
        : null;
    const component = cited ? componentOf(cited.path, architecture) : null;
    const comments = (run.challenges ?? [])
      .filter((challenge) => group.findingIds.includes(challenge.findingId))
      .map((challenge) => ({
        ...challenge,
        agentName: agentName(challenge.agentId),
      }));
    const remediation = run.remediations?.[group.id] ?? null;
    const edits = remediation?.edits ?? [];
    return {
      id: group.id,
      title: group.title,
      summary: group.summary,
      type: group.type,
      severity: group.severity,
      where:
        workspace ??
        (component ? (componentName.get(component) ?? component) : null),
      location: cited ? { path: cited.path, line: cited.startLine } : null,
      agents: AGENT_IDS.filter((id) =>
        merged.some((finding) => finding.agentId === id),
      ),
      challenge: {
        support: comments.filter((c) => c.stance === "support").length,
        dispute: comments.filter((c) => c.stance === "dispute").length,
      },
      patch:
        edits.length > 0
          ? {
              added: edits.reduce((sum, edit) => sum + edit.after.length, 0),
              removed: edits.reduce((sum, edit) => sum + edit.before.length, 0),
              files: new Set(edits.map((edit) => edit.path)).size,
            }
          : null,
      remediation,
      workOrder:
        run.workOrders.find((order) => order.groupIds.includes(group.id)) ??
        null,
      findings: merged,
      comments,
      foundByCode: group.foundBy === "code",
    };
  });
}

/** The kinds that have issues, with how many, in the usual order. */
export function kindCounts(rows: IssueRow[]) {
  return FINDING_TYPE_ORDER.map((type) => ({
    type,
    label: FINDING_TYPE_LABEL[type],
    count: rows.filter((row) => row.type === type).length,
  })).filter((item) => item.count > 0);
}

export type IssueSort = "severity" | "agreement" | "kind";

export const SORT_LABEL: Record<IssueSort, string> = {
  severity: "Severity",
  agreement: "Agents agreeing",
  kind: "Kind",
};

const bySeverity = (a: IssueRow, b: IssueRow) =>
  SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);

export function sortRows(rows: IssueRow[], sort: IssueSort): IssueRow[] {
  const copy = [...rows];
  if (sort === "severity") return copy.sort(bySeverity);
  if (sort === "agreement") {
    return copy.sort(
      (a, b) =>
        b.agents.length +
          b.challenge.support -
          b.challenge.dispute -
          (a.agents.length + a.challenge.support - a.challenge.dispute) ||
        bySeverity(a, b),
    );
  }
  return copy.sort(
    (a, b) =>
      FINDING_TYPE_ORDER.indexOf(a.type) - FINDING_TYPE_ORDER.indexOf(b.type) ||
      bySeverity(a, b),
  );
}

/** Rows whose title, summary, place or file has every word of the query. */
export function searchRows(rows: IssueRow[], query: string): IssueRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((row) => {
    const text = [
      row.title,
      row.summary,
      row.where ?? "",
      row.location?.path ?? "",
      FINDING_TYPE_LABEL[row.type],
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
