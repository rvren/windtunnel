import type { RunImpact } from "@/server/engine/schema";

import { routeAlong, type FlightPlan } from "./flight-path";

/*
 * Crosswind's change as a ripple over the map after it: a stop on each
 * part the change makes or alters, then a hop from the nearest of those to
 * each part it affects, nearest first. A change in words that marks no
 * part as changed starts from the parts it names. Pure.
 */

const GENERIC = new Set(["service", "database", "system", "worker", "queue"]);

/** The parts a change in words names, by their names or ids. */
function named(
  impact: RunImpact,
  text: string,
): { id: string; note: string }[] {
  const words = text.toLowerCase();
  return (impact.after?.components ?? [])
    .filter((part) =>
      [part.id.replace(/^cmp-/, ""), ...part.name.split(/\s+/)]
        .map((word) => word.toLowerCase())
        .some(
          (word) =>
            word.length >= 4 &&
            !GENERIC.has(word) &&
            new RegExp(`\\b${word}\\b`).test(words),
        ),
    )
    .map((part) => ({
      id: part.id,
      note:
        impact.components.find((item) => item.id === part.id)?.note ??
        "Named by the change.",
    }));
}

export function rippleFlight(
  impact: RunImpact,
  changeText = "",
): FlightPlan | null {
  const after = impact.after;
  if (!after) return null;
  const onMap = new Set(after.components.map((item) => item.id));
  const marked = impact.components.filter(
    (part) =>
      (part.effect === "changed" || part.effect === "added") &&
      onMap.has(part.id),
  );
  const sources = marked.length > 0 ? marked : named(impact, changeText);
  if (sources.length === 0) return null;
  const starts = new Set(sources.map((part) => part.id));
  const affected = impact.components.filter(
    (part) =>
      part.effect === "affected" && onMap.has(part.id) && !starts.has(part.id),
  );
  const reach = affected
    .map((part) => {
      const routes = sources.map((source) =>
        routeAlong(source.id, part.id, after.connections),
      );
      const best = routes.sort((a, b) => a.length - b.length)[0];
      return { part, from: best[0], steps: best.length };
    })
    .sort((a, b) => a.steps - b.steps);
  return {
    cut: [],
    hops: [
      ...sources.map((part) => ({
        id: part.id,
        from: part.id,
        to: part.id,
        label: part.note,
        location: null,
        tone: "accent" as const,
      })),
      ...reach.map(({ part, from }) => ({
        id: part.id,
        from,
        to: part.id,
        label: part.note,
        location: null,
        tone: "warning" as const,
      })),
    ],
  };
}
