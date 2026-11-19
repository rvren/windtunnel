import { componentOf } from "@/server/engine/architecture";
import type { Architecture, CodeLocation } from "@/server/engine/schema";

/*
 * A flight path: an ordered route of hops across a project's architecture
 * map, each one a cited step. Engine Out's cascade, Flutter's attack chain,
 * Crosswind's ripple and Black Box's failing request are all drawn as one.
 * Pure, so the route is tested without a browser; drawn by
 * components/project/architecture-diagram.tsx.
 */

/** What a hop means, as one of four colours. */
export type HopTone = "danger" | "warning" | "ok" | "accent";

export interface FlightHop {
  id: string;
  /**
   * The parts the hop joins, as ids of the architecture's components. The
   * same id twice is a step inside one part.
   */
  from: string;
  to: string;
  /** One line: what happens on this hop. */
  label: string;
  location: CodeLocation | null;
  tone: HopTone;
}

export interface FlightPlan {
  hops: FlightHop[];
  /** Parts drawn as cut off: the part Engine Out takes away. */
  cut: string[];
}

export interface PlacedHop extends FlightHop {
  /** Its number on the map, from 1. */
  number: number;
}

/**
 * The hops that can be drawn on this map, numbered in order. A hop whose
 * ends are not on the map is left out of the drawing (its step is still
 * listed beside it), and the numbers stay those of the whole route.
 */
export function placedHops(
  plan: FlightPlan,
  partIds: Iterable<string>,
): PlacedHop[] {
  const known = new Set(partIds);
  return plan.hops
    .map((hop, index) => ({ ...hop, number: index + 1 }))
    .filter((hop) => known.has(hop.from) && known.has(hop.to));
}

/** Every part the route touches, in the order it first reaches each. */
export function partsOnPath(plan: FlightPlan): string[] {
  const seen: string[] = [];
  for (const hop of plan.hops) {
    for (const id of [hop.from, hop.to]) {
      if (!seen.includes(id)) seen.push(id);
    }
  }
  return seen;
}

export interface CitedStep {
  id: string;
  label: string;
  location: CodeLocation | null;
  tone: HopTone;
}

/**
 * A sequence of cited steps as hops. Each step sits in the part its file
 * belongs to; its hop runs from the part of the step before (the first
 * step stays inside its own part). A step whose file is in no part keeps
 * the part of the step before, so the route never jumps to nowhere; steps
 * before the first placed one are dropped from the route.
 */
export function hopsAlong(
  steps: CitedStep[],
  architecture: Architecture | undefined,
): FlightHop[] {
  const hops: FlightHop[] = [];
  let previous: string | null = null;
  for (const step of steps) {
    const part: string | null = step.location
      ? componentOf(step.location.path, architecture)
      : null;
    const here: string | null = part ?? previous;
    if (!here) continue;
    hops.push({
      id: step.id,
      from: previous ?? here,
      to: here,
      label: step.label,
      location: step.location,
      tone: step.tone,
    });
    previous = here;
  }
  return hops;
}
