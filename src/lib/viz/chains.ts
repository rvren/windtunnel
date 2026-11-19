import { groupLocation } from "@/server/engine/architecture";
import type { AttackChain, RunRecord } from "@/server/engine/schema";

import { hopsAlong, type FlightPlan } from "./flight-path";

/*
 * Flutter's chains, ready to show: each link with the issue it is, and the
 * chain as a flight path across the map, one stop per link. Pure.
 */

export interface ChainLinkView {
  /** The hop id on the map: the link's issue. */
  id: string;
  number: number;
  role: string;
  title: string;
  severity: AttackChain["severity"];
  location: {
    path: string;
    startLine: number;
    endLine: number;
    quote: string;
  } | null;
  via: AttackChain["links"][number]["via"];
}

export function chainLinks(
  chain: AttackChain,
  run: Pick<RunRecord, "groups" | "agents">,
): ChainLinkView[] {
  return chain.links.flatMap((link, index) => {
    const group = run.groups.find((item) => item.id === link.groupId);
    if (!group) return [];
    return [
      {
        id: link.groupId,
        number: index + 1,
        role: link.role,
        title: group.title,
        severity: group.severity,
        location: groupLocation(group, run),
        via: link.via,
      },
    ];
  });
}

/** The chain as a route over the run's architecture: one stop per link. */
export function chainFlight(
  chain: AttackChain,
  run: Pick<RunRecord, "groups" | "agents" | "source">,
): FlightPlan {
  const links = chainLinks(chain, run);
  return {
    cut: [],
    hops: hopsAlong(
      links.map((link) => ({
        id: link.id,
        label: link.role,
        location: link.location,
        tone: "danger" as const,
      })),
      run.source?.architecture,
    ),
  };
}

/** How many accepted issues a run's chains use, counted once each. */
export function issuesInChains(chains: AttackChain[]): number {
  return new Set(chains.flatMap((chain) => chain.links.map((l) => l.groupId)))
    .size;
}
