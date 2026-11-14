import type {
  FlowBand,
  FlowGroup,
  FlowNodeData,
  FlowView,
} from "./cockpit-views";

/*
 * Lays out a flow view to fit one box exactly, so every view of the cockpit
 * has the same height. Each column's nodes are spaced evenly and every node
 * is shown, however many there are: rings shrink to the room, and when a
 * column is crowded its names move beside the rings ("compact"). Groups
 * list as many items as fit. Pure, so it is tested without a browser.
 * Drawn by components/project/command/flow-canvas.
 */

export const RING = { min: 22, max: 34 } as const;
/** The smallest ring in a crowded column. */
export const COMPACT_MIN = 8;
/** Hubs may go a little smaller before they turn compact. */
const HUB_MIN = 18;
/** Room under a ring for its name and second line. */
export const LABEL = 36;
/** The tick ring around a hub, and the dashed ring around a source. */
export const TICKS = 13;
export const HALO = 8;
/** In a crowded column the halo and ticks are thinner. */
export const COMPACT_HALO = 4;
/** A group's first line, one listed item, and "View all". */
const GROUP_HEAD = 24;
const LEAF = 16;
const VIEW_ALL = 18;
/** From the top of a group's block to its dot. */
export const GROUP_DOT = 11;
/** Where the columns sit; crowded sources move right, names on their left. */
export const LEFT = 84;
export const LEFT_COMPACT = 196;
export const RIGHT_ROOM = 268;

export interface StageNode<T extends FlowNodeData = FlowNodeData> {
  id: string;
  column: 0 | 1 | 2;
  x: number;
  y: number;
  /** The ring's radius; for a group, the dot's room. */
  r: number;
  data: T;
  /** Names beside the ring instead of under it: the column is crowded. */
  compact: boolean;
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
  /**
   * Groups, each with how many items it lists and where its block of words
   * starts: the block is centred on its slot and never leaves the box.
   */
  groups: (StageNode<FlowGroup> & { leaves: number; top: number })[];
  bands: StageBand[];
  /** The x of each column: sources, hubs, groups. */
  columns: [number, number, number];
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** The slot a ring with its label under it needs at the least. */
const FULL_SLOT = {
  source: RING.min * 2 + HALO * 2 + LABEL,
  hub: HUB_MIN * 2 + TICKS * 2 + LABEL,
};

export function layoutStage(
  view: FlowView,
  box: { width: number; height: number },
): StageLayout {
  const { width, height } = box;
  const sourceSlot = height / Math.max(1, view.sources.length);
  const hubSlot = height / Math.max(1, view.hubs.length);
  const sourcesCompact = sourceSlot < FULL_SLOT.source;
  const hubsCompact = hubSlot < FULL_SLOT.hub;
  const left = sourcesCompact ? LEFT_COMPACT : LEFT;
  const columns: [number, number, number] = [
    left,
    left + (width - RIGHT_ROOM - left) / 2,
    width - RIGHT_ROOM,
  ];

  // Even slots. A full ring and its label are one unit centred in the slot
  // (the ring sits half a label above the middle); a compact ring sits in
  // the middle, its name beside it.
  const place = <T extends FlowNodeData>(
    nodes: T[],
    column: 0 | 1 | 2,
    compact: boolean,
    radius: (slot: number) => number,
    lift: number,
  ): StageNode<T>[] => {
    const slot = height / Math.max(1, nodes.length);
    return nodes.map((data, index) => ({
      id: data.id,
      column,
      x: columns[column],
      y: slot * (index + 0.5) - (compact ? 0 : lift),
      r: radius(slot),
      data,
      compact,
    }));
  };
  const sources = place(
    view.sources,
    0,
    sourcesCompact,
    (slot) =>
      sourcesCompact
        ? clamp(slot / 2 - COMPACT_HALO - 2, COMPACT_MIN, RING.min)
        : clamp((slot - LABEL) / 2 - HALO, RING.min, RING.max),
    LABEL / 2,
  );
  const hubs = place(
    view.hubs,
    1,
    hubsCompact,
    (slot) =>
      hubsCompact
        ? clamp(slot / 2 - COMPACT_HALO - 6, COMPACT_MIN, HUB_MIN)
        : clamp((slot - LABEL) / 2 - TICKS, HUB_MIN, RING.max),
    LABEL / 2,
  );
  const groupSlot = height / Math.max(1, view.groups.length);
  const groups = place(view.groups, 2, false, () => 6, 0).map((node) => {
    const fits = Math.floor((groupSlot - GROUP_HEAD - VIEW_ALL - 6) / LEAF);
    const leaves = clamp(fits, 0, Math.min(3, node.data.leaves?.length ?? 0));
    const block = Math.min(groupSlot, GROUP_HEAD + VIEW_ALL) + leaves * LEAF;
    const top = clamp(node.y - block / 2, 0, Math.max(0, height - block));
    // The dot, where the bands land, sits on the block's first line.
    return { ...node, leaves, top, y: top + GROUP_DOT };
  });

  // One scale for every band: the busiest node's bands fit its ring.
  const all = [...sources, ...hubs, ...groups];
  const bands = view.bands;
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
