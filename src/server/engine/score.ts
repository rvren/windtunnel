import type { AgentRun, FindingGroup, ScoreRow, Severity } from "./schema";

/*
 * The scoreboard: how the agents "compete". An agent scores for each accepted
 * group it contributed to, by the group's severity. When several agents found
 * the same thing they share the points, so finding what nobody else found is
 * worth more.
 */

export const SEVERITY_POINTS: Record<Severity, number> = {
  critical: 8,
  high: 5,
  medium: 3,
  low: 1,
};

export function scoreAgents(
  agents: AgentRun[],
  groups: FindingGroup[],
  rejected: { findingId: string }[],
): ScoreRow[] {
  const agentOf = new Map(
    agents.flatMap((agent) =>
      agent.findings.map((finding) => [finding.uid, agent.agentId] as const),
    ),
  );
  const rows = new Map<string, ScoreRow>(
    agents.map((agent) => [
      agent.agentId,
      {
        agentId: agent.agentId,
        points: 0,
        accepted: 0,
        rejected: 0,
        unique: 0,
        scenarios: agent.scenarios.length,
      },
    ]),
  );

  for (const group of groups) {
    const contributors = new Set<string>();
    for (const uid of group.findingIds) {
      const agentId = agentOf.get(uid);
      if (!agentId) continue;
      contributors.add(agentId);
      rows.get(agentId)!.accepted += 1;
    }
    const share = SEVERITY_POINTS[group.severity] / (contributors.size || 1);
    for (const agentId of contributors) {
      const row = rows.get(agentId)!;
      row.points += share;
      if (contributors.size === 1) row.unique += 1;
    }
  }

  for (const item of rejected) {
    const agentId = agentOf.get(item.findingId);
    if (agentId) rows.get(agentId)!.rejected += 1;
  }

  return [...rows.values()]
    .map((row) => ({ ...row, points: Math.round(row.points * 10) / 10 }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.unique - a.unique ||
        a.agentId.localeCompare(b.agentId),
    );
}
