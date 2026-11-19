import type { OutageHop, RunOutage, Severity } from "@/server/engine/schema";

import type { FlightPlan, HopTone } from "./flight-path";

/*
 * Engine Out's result, ready to show: the cascade as a flight path out
 * from the part that was cut, and the three numbers. Pure; counted from
 * the run, nothing estimated.
 */

const RANK: Severity[] = ["critical", "high", "medium", "low"];

export function hopTone(
  hop: Pick<OutageHop, "behaviour" | "severity">,
): HopTone {
  if (hop.behaviour === "holds") return "ok";
  return hop.severity === "critical" || hop.severity === "high"
    ? "danger"
    : "warning";
}

/** The cascade over the map: the cut part, then each hop in order. */
export function outageFlight(outage: RunOutage): FlightPlan {
  return {
    cut: [outage.part.id],
    hops: outage.hops.map((hop) => ({
      id: hop.id,
      from: hop.from,
      to: hop.to,
      label: hop.effect,
      location: hop.location,
      tone: hopTone(hop),
    })),
  };
}

export interface OutageNumbers {
  broken: number;
  /** Parts the failure reaches, the cut part left out. */
  reached: number;
  /** Hops where a time limit, a fallback or a safe retry keeps it working. */
  holds: number;
}

export function outageNumbers(outage: RunOutage): OutageNumbers {
  const reached = new Set(
    outage.hops
      .filter((hop) => hop.behaviour !== "holds")
      .map((hop) => hop.to)
      .filter((id) => id !== outage.part.id),
  );
  return {
    broken: outage.journeys.filter((item) => item.broken).length,
    reached: reached.size,
    holds: outage.hops.filter((hop) => hop.behaviour === "holds").length,
  };
}

/** The worst hops first, for the result card. */
export function worstHops(outage: RunOutage, count = 3): OutageHop[] {
  return [...outage.hops]
    .filter((hop) => hop.behaviour !== "holds")
    .sort((a, b) => RANK.indexOf(a.severity) - RANK.indexOf(b.severity))
    .slice(0, count);
}

/** "Billing service, slowed down". */
export function cutLabel(outage: RunOutage): string {
  return `${outage.part.name}, ${outage.mode === "slow" ? "slowed down" : "down"}`;
}
