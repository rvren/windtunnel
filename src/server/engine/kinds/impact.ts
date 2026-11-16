import { componentOf } from "../architecture";
import type {
  Architecture,
  ChangedFile,
  FindingGroup,
  ImpactEffect,
  RunImpact,
} from "../schema";

/*
 * Crosswind's map of a change, worked out in code: which parts of the
 * application it touches, and how the architecture differs before and
 * after. Pure.
 */

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parts and connections in `after` that are not in `before`, and back. */
export function diffArchitectures(
  before: Architecture | null,
  after: Architecture | null,
): {
  added: string[];
  removed: Architecture["components"];
  connections: RunImpact["connections"];
} {
  if (!before || !after) return { added: [], removed: [], connections: [] };
  const beforeNames = new Set(before.components.map((item) => key(item.name)));
  const afterNames = new Set(after.components.map((item) => key(item.name)));
  const nameOf = (architecture: Architecture, id: string) =>
    architecture.components.find((item) => item.id === id)?.name ?? id;
  const edge = (
    architecture: Architecture,
    item: { from: string; to: string },
  ) =>
    `${key(nameOf(architecture, item.from))}>${key(nameOf(architecture, item.to))}`;
  const beforeEdges = new Set(
    before.connections.map((item) => edge(before, item)),
  );
  const afterEdges = new Set(
    after.connections.map((item) => edge(after, item)),
  );
  return {
    added: after.components
      .filter((item) => !beforeNames.has(key(item.name)))
      .map((item) => item.id),
    removed: before.components.filter(
      (item) => !afterNames.has(key(item.name)),
    ),
    connections: [
      ...after.connections
        .filter((item) => !beforeEdges.has(edge(after, item)))
        .map((item) => ({
          from: nameOf(after, item.from),
          to: nameOf(after, item.to),
          label: item.label,
          effect: "added" as const,
        })),
      ...before.connections
        .filter((item) => !afterEdges.has(edge(before, item)))
        .map((item) => ({
          from: nameOf(before, item.from),
          to: nameOf(before, item.to),
          label: item.label,
          effect: "removed" as const,
        })),
    ],
  };
}

/**
 * Each part's effect: added or removed (from the two architectures),
 * changed (a changed file is in it), or affected (a finding lands in it).
 */
export function touchedParts(
  files: ChangedFile[],
  groups: FindingGroup[],
  before: Architecture | null,
  after: Architecture | null,
): RunImpact["components"] {
  const diff = diffArchitectures(before, after);
  const parts = new Map<
    string,
    { id: string; name: string; effect: ImpactEffect; notes: string[] }
  >();
  const named = (id: string) =>
    after?.components.find((item) => item.id === id)?.name ?? id;
  const mark = (id: string, effect: ImpactEffect, note: string) => {
    const part = parts.get(id) ?? {
      id,
      name: named(id),
      effect,
      notes: [],
    };
    // added and removed outrank changed, which outranks affected.
    const rank = { added: 3, removed: 3, changed: 2, affected: 1 };
    if (rank[effect] > rank[part.effect]) part.effect = effect;
    if (note && !part.notes.includes(note)) part.notes.push(note);
    parts.set(id, part);
  };
  for (const id of diff.added) mark(id, "added", "New in this change");
  for (const file of files) {
    const id = componentOf(file.path, after ?? undefined);
    if (id) mark(id, "changed", file.path);
  }
  for (const group of groups) {
    const id = group.location
      ? componentOf(group.location.path, after ?? undefined)
      : null;
    if (id) mark(id, "affected", group.title);
  }
  const touched = [...parts.values()].map((part) => ({
    id: part.id,
    name: part.name,
    effect: part.effect,
    note:
      part.notes.length > 3
        ? `${part.notes.slice(0, 3).join("; ")} and ${part.notes.length - 3} more`
        : part.notes.join("; "),
  }));
  return [
    ...touched,
    ...diff.removed.map((item) => ({
      id: item.id,
      name: item.name,
      effect: "removed" as const,
      note: "Gone after this change",
    })),
  ];
}
