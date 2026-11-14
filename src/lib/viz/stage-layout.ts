import type {
  FlowBand,
  FlowGroup,
  FlowNodeData,
  FlowView,
} from "./cockpit-views";

/*
 * Lays out a flow view to fit one box exactly, so every view of the cockpit
 * has the same height. Each column's nodes are spaced evenly; rings shrink
 * to the room; a column with more nodes than fit folds its smallest into
 * one "+N more" node; groups list as many items as fit. Pure, so it is
 * tested without a browser. Drawn by components/project/command/flow-canvas.
 */

export const RING = { min: 22, max: 34 } as const;
/** Hubs may go a little smaller, so all four kinds fit. */
const HUB_MIN = 18;
/** Room under a ring for its name and second line. */
export const LABEL = 36;
/** The tick ring around a hub, and the dashed ring around a source. */
export const TICKS = 13;
export const HALO = 8;
/** A group's first line, one listed item, and "View all". */
const GROUP_HEAD = 24;
const LEAF = 16;
const VIEW_ALL = 18;
/** Where the columns sit. */
export const LEFT = 84;
export const RIGHT_ROOM = 268;

export interface StageNode<T extends FlowNodeData = FlowNodeData> {
  id: string;
  column: 0 | 1 | 2;
  x: number;
  y: number;
  /** The ring's radius; for a group, the dot's room. */
  r: number;
  data: T;
  /** True for the node that holds the folded rest of a column. */
  folded?: boolean;
}

export interface StageBand extends FlowBand {
  x0: number;
  x1: number;
  /** The top edge of the band where it leaves and where it enters. */
  y0: number;
  y1: number;
  thickness: number;
}

export interface StageLayout {
  sources: StageNode[];
  hubs: StageNode[];
  groups: (StageNode<FlowGroup> & { leaves: number })[];
  bands: StageBand[];
  /** The x of each column: sources, hubs, groups. */
  columns: [number, number, number];
}

/** The fewest pixels a node of each column needs, with the smallest ring. */
const MIN_SLOT = [
  RING.min * 2 + HALO * 2 + LABEL,
  HUB_MIN * 2 + TICKS * 2 + LABEL,
  GROUP_HEAD + 6,
] as const;

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/**
 * Keeps the largest nodes that fit and folds the rest into one. Returns the
 * kept nodes and a map from each folded id to the fold's id.
 */
export function foldColumn<T extends FlowNodeData>(
  nodes: T[],
  room: number,
  column: number,
): { nodes: (T | FlowNodeData)[]; into: Map<string, string> } {
  const into = new Map<string, string>();
  if (nodes.length <= room || room < 2) {
    if (nodes.length > room && room < 2) {
      // Not even two fit: everything is one node.
      const id = `more:${column}`;
      for (const node of nodes) into.set(node.id, id);
      return {
        nodes: [
          {
            id,
            label: `${nodes.length} more`,
            value: nodes.reduce((sum, node) => sum + node.value, 0),
          },
        ],
        into,
      };
    }
    return { nodes, into };
  }
  const keep = [...nodes]
    .sort((a, b) => b.value - a.value)
    .slice(0, room - 1)
    .map((node) => node.id);
  const kept = nodes.filter((node) => keep.includes(node.id));
  const rest = nodes.filter((node) => !keep.includes(node.id));
  const id = `more:${column}`;
  for (const node of rest) into.set(node.id, id);
  const value = rest.reduce((sum, node) => sum + node.value, 0);
  const fold: FlowNodeData | FlowGroup =
    column === 2
      ? ({
          id,
          label: `${rest.length} more`,
          value,
          sub: `${rest.length} groups`,
          leaves: [],
          more: 0,
        } satisfies FlowGroup)
      : { id, label: `${rest.length} more`, value, sub: `${rest.length} more` };
  return { nodes: [...kept, fold], into };
}

export function layoutStage(
  view: FlowView,
  box: { width: number; height: number },
): StageLayout {
  const { width, height } = box;
  const columns: [number, number, number] = [
    LEFT,
    LEFT + (width - RIGHT_ROOM - LEFT) / 2,
    width - RIGHT_ROOM,
  ];

  // Fold what does not fit, column by column.
  const room = MIN_SLOT.map((slot) => Math.max(1, Math.floor(height / slot)));
  const folds = [
    foldColumn(view.sources, room[0], 0),
    foldColumn(view.hubs, room[1], 1),
    foldColumn(view.groups, room[2], 2),
  ];
  const renamed = (id: string) =>
    folds.reduce((name, fold) => fold.into.get(name) ?? name, id);
  const merged = new Map<string, FlowBand>();
  for (const band of view.bands) {
    const source = renamed(band.source);
    const target = renamed(band.target);
    const key = `${source}>${target}>${band.tone}`;
    const into = merged.get(key) ?? { ...band, source, target, value: 0 };
    into.value += band.value;
    merged.set(key, into);
  }
  const bands = [...merged.values()];

  // Even slots; rings sized to the slot.
  // A ring and its label are one unit, centred in its slot: the ring sits
  // half a label above the slot's middle.
  const place = <T extends FlowNodeData>(
    nodes: T[],
    column: 0 | 1 | 2,
    radius: (slot: number) => number,
    lift: number,
  ): StageNode<T>[] => {
    const slot = height / Math.max(1, nodes.length);
    return nodes.map((data, index) => ({
      id: data.id,
      column,
      x: columns[column],
      y: slot * (index + 0.5) - lift,
      r: radius(slot),
      data,
      ...(data.id.startsWith("more:") ? { folded: true } : {}),
    }));
  };
  const sources = place(
    folds[0].nodes,
    0,
    (slot) => clamp((slot - LABEL) / 2 - HALO, RING.min, RING.max),
    LABEL / 2,
  );
  const hubs = place(
    folds[1].nodes,
    1,
    (slot) => clamp((slot - LABEL) / 2 - TICKS, HUB_MIN, RING.max),
    LABEL / 2,
  );
  const groupSlot = height / Math.max(1, folds[2].nodes.length);
  const groups = place(folds[2].nodes as FlowGroup[], 2, () => 6, 0).map(
    (node) => {
      const fits = Math.floor((groupSlot - GROUP_HEAD - VIEW_ALL - 6) / LEAF);
      return {
        ...node,
        leaves: clamp(fits, 0, Math.min(3, node.data.leaves?.length ?? 0)),
      };
    },
  );

  // One scale for every band: the busiest node's bands fit its ring.
  const all = [...sources, ...hubs, ...groups];
  const through = (id: string) =>
    Math.max(
      bands.filter((b) => b.source === id).reduce((s, b) => s + b.value, 0),
      bands.filter((b) => b.target === id).reduce((s, b) => s + b.value, 0),
    );
  const scale = Math.min(
    ...all.map((node) => {
      const value = through(node.id);
      const room = node.column === 2 ? 40 : node.r * 1.6;
      return value > 0 ? room / value : Infinity;
    }),
    8,
  );

  // Stack each node's bands around its centre, in the order of the far end.
  const at = new Map(all.map((node) => [node.id, node]));
  const outTop = new Map<string, number>();
  const inTop = new Map<string, number>();
  for (const node of all) {
    outTop.set(node.id, node.y - (through(node.id) * scale) / 2);
    inTop.set(node.id, node.y - (through(node.id) * scale) / 2);
  }
  const placed: StageBand[] = [];
  const ordered = [...bands]
    .filter((band) => at.has(band.source) && at.has(band.target))
    .sort(
      (a, b) =>
        at.get(a.source)!.y - at.get(b.source)!.y ||
        at.get(a.target)!.y - at.get(b.target)!.y,
    );
  for (const band of ordered) {
    const source = at.get(band.source)!;
    const target = at.get(band.target)!;
    const thickness = band.value * scale;
    const y0 = outTop.get(source.id)!;
    const y1 = inTop.get(target.id)!;
    outTop.set(source.id, y0 + thickness);
    inTop.set(target.id, y1 + thickness);
    placed.push({ ...band, x0: source.x, x1: target.x, y0, y1, thickness });
  }

  return { sources, hubs, groups, bands: placed, columns };
}
