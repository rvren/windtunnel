import { AGENT_IDS, type AgentId } from "@/lib/agents";
import { SEVERITY_ORDER } from "@/lib/labels";
import type { Architecture, Severity } from "@/server/engine/schema";

import type { Feed } from "./run-feed";

/*
 * What the live map shows at this moment of a run, worked out from the feed
 * alone: where each agent is reading, and what has been found in each part
 * of the application so far. Pure.
 */

/** The component a file belongs to: the one whose path matches most closely. */
export function componentOfPath(
  path: string | null,
  architecture: Architecture | null,
): string | null {
  if (!path || !architecture) return null;
  let best: { id: string; length: number } | null = null;
  for (const component of architecture.components) {
    for (const prefix of component.paths) {
      if (path !== prefix && !path.startsWith(`${prefix}/`)) continue;
      if (!best || prefix.length > best.length) {
        best = { id: component.id, length: prefix.length };
      }
    }
  }
  return best?.id ?? null;
}

export interface LiveMapState {
  /** For each component: the agents reading it now, and the findings so far. */
  components: Record<
    string,
    { agents: AgentId[]; findings: number; worst: Severity | null }
  >;
  /** Agents that are not reading any one component right now. */
  idle: AgentId[];
  /** Findings filed so far, in all. */
  findings: number;
}

export function liveMapState(feed: Feed): LiveMapState {
  const components: LiveMapState["components"] = {};
  for (const component of feed.architecture?.components ?? []) {
    components[component.id] = { agents: [], findings: 0, worst: null };
  }
  const idle: AgentId[] = [];
  for (const id of AGENT_IDS) {
    const agent = feed.agents[id];
    const at =
      agent.status === "running"
        ? componentOfPath(agent.reading, feed.architecture)
        : null;
    if (at) components[at].agents.push(id);
    else idle.push(id);
  }
  for (const finding of feed.live) {
    const at = componentOfPath(finding.path, feed.architecture);
    if (!at) continue;
    const entry = components[at];
    entry.findings += 1;
    if (
      !entry.worst ||
      SEVERITY_ORDER.indexOf(finding.severity) <
        SEVERITY_ORDER.indexOf(entry.worst)
    ) {
      entry.worst = finding.severity;
    }
  }
  return { components, idle, findings: feed.live.length };
}
