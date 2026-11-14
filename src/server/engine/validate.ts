import type { AgentId } from "@/lib/agents";

import type {
  AgentReport,
  DroppedFinding,
  Finding,
  FindingGroup,
  Verdict,
  WorkOrder,
} from "./schema";

/*
 * The checks that keep the report honest. A model can cite a step that does
 * not exist or merge a finding it was never given; code does not let either
 * through.
 */

/**
 * Checks one agent's findings against its own scenarios and the ids that
 * exist in the run. A finding must point at one real scenario step at least.
 * Citations that point at nothing are removed; a finding left with no
 * evidence is dropped, with the reason kept for the report.
 */
export function checkAgentReport(
  agentId: AgentId,
  report: AgentReport,
  knownIds: Set<string>,
): { findings: Finding[]; dropped: DroppedFinding[] } {
  const stepCount = new Map(
    report.scenarios.map((scenario) => [scenario.id, scenario.steps.length]),
  );
  const findings: Finding[] = [];
  const dropped: DroppedFinding[] = [];
  const seen = new Set<string>();

  for (const raw of report.findings) {
    if (seen.has(raw.id)) {
      dropped.push({
        agentId,
        title: raw.title,
        reason: `Its id "${raw.id}" was already used by another finding.`,
      });
      continue;
    }
    seen.add(raw.id);

    const evidence = raw.evidence.filter((item) => {
      const steps = stepCount.get(item.scenarioId);
      return steps !== undefined && item.step >= 1 && item.step <= steps;
    });
    if (evidence.length === 0) {
      dropped.push({
        agentId,
        title: raw.title,
        reason: "It cites no scenario step that exists.",
      });
      continue;
    }

    findings.push({
      ...raw,
      evidence,
      refs: raw.refs.filter((ref) => knownIds.has(ref)),
      uid: `${agentId}/${raw.id}`,
      agentId,
    });
  }

  return { findings, dropped };
}

/**
 * Reconciles the judge's verdict with the findings it was given. Every
 * finding ends up in exactly one place: an accepted group or the rejected
 * list. Ids the judge invented are ignored. Findings the judge left out are
 * kept as their own groups, marked as not reviewed, so nothing is lost
 * silently.
 */
export function reconcileVerdict(
  verdict: Verdict,
  findings: Finding[],
): {
  groups: FindingGroup[];
  rejected: { findingId: string; reason: string }[];
} {
  const byUid = new Map(findings.map((finding) => [finding.uid, finding]));
  const placed = new Set<string>();

  const groups: FindingGroup[] = [];
  for (const group of verdict.groups) {
    const findingIds = group.findingIds.filter((uid) => {
      if (!byUid.has(uid) || placed.has(uid)) return false;
      placed.add(uid);
      return true;
    });
    if (findingIds.length > 0) {
      groups.push({ ...group, findingIds, reviewed: true });
    }
  }

  const rejected = verdict.rejected.filter((item) => {
    if (!byUid.has(item.findingId) || placed.has(item.findingId)) return false;
    placed.add(item.findingId);
    return true;
  });

  for (const finding of findings) {
    if (placed.has(finding.uid)) continue;
    groups.push({
      id: `unreviewed-${finding.uid}`,
      title: finding.title,
      type: finding.type,
      severity: finding.severity,
      summary: finding.description,
      findingIds: [finding.uid],
      reviewed: false,
    });
  }

  // Ids must be unique for work orders to point at them.
  const ids = new Set<string>();
  for (const group of groups) {
    let id = group.id;
    for (let n = 2; ids.has(id); n += 1) id = `${group.id}-${n}`;
    group.id = id;
    ids.add(id);
  }

  return { groups, rejected };
}

/**
 * Removes work-order links to groups that do not exist, drops work orders
 * left with no group, and lists the groups no work order covers.
 */
export function checkWorkOrders(
  workOrders: WorkOrder[],
  groups: FindingGroup[],
): { workOrders: WorkOrder[]; unaddressedGroupIds: string[] } {
  const groupIds = new Set(groups.map((group) => group.id));
  const covered = new Set<string>();

  const kept = workOrders
    .map((workOrder) => ({
      ...workOrder,
      groupIds: workOrder.groupIds.filter((id) => groupIds.has(id)),
    }))
    .filter((workOrder) => workOrder.groupIds.length > 0);

  for (const workOrder of kept) {
    for (const id of workOrder.groupIds) covered.add(id);
  }

  return {
    workOrders: kept,
    unaddressedGroupIds: groups
      .map((group) => group.id)
      .filter((id) => !covered.has(id)),
  };
}
