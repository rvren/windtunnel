/*
 * Lays out a three-column flow chart: where each node sits and the shape of
 * each band. Pure, so it is tested without a browser. The drawing is
 * components/project/sankey.tsx.
 */

export interface FlowNode {
  id: string;
  column: number;
  value: number;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
}

export interface PlacedNode {
  id: string;
  column: number;
  x: number;
  y: number;
  height: number;
}

export interface PlacedLink {
  source: string;
  target: string;
  value: number;
  /** A closed path: the band between the two nodes. */
  d: string;
}

export interface FlowLayout {
  nodes: PlacedNode[];
  links: PlacedLink[];
}

export const NODE_WIDTH = 6;

export function layoutFlow(
  nodes: FlowNode[],
  links: FlowLink[],
  size: { width: number; height: number; gap: number },
): FlowLayout {
  const columns = [...new Set(nodes.map((node) => node.column))].sort(
    (a, b) => a - b,
  );
  if (columns.length === 0) return { nodes: [], links: [] };

  // One scale for every column, set by the column that needs most room.
  const scale = Math.min(
    ...columns.map((column) => {
      const own = nodes.filter((node) => node.column === column);
      const total = own.reduce((sum, node) => sum + node.value, 0);
      return (size.height - size.gap * (own.length - 1)) / Math.max(total, 1);
    }),
  );
  const step =
    columns.length > 1 ? (size.width - NODE_WIDTH) / (columns.length - 1) : 0;

  const placed = new Map<string, PlacedNode>();
  for (const [index, column] of columns.entries()) {
    const own = nodes.filter((node) => node.column === column);
    const used =
      own.reduce((sum, node) => sum + node.value * scale, 0) +
      size.gap * (own.length - 1);
    let y = (size.height - used) / 2;
    for (const node of own) {
      const height = node.value * scale;
      placed.set(node.id, {
        id: node.id,
        column,
        x: index * step,
        y,
        height,
      });
      y += height + size.gap;
    }
  }

  // Bands leave and enter a node in the order of the nodes at their far end,
  // so they do not cross more than they must.
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const leftAt = new Map<string, number>();
  const rightAt = new Map<string, number>();
  const sorted = [...links]
    .filter((link) => placed.has(link.source) && placed.has(link.target))
    .sort(
      (a, b) =>
        order.get(a.source)! - order.get(b.source)! ||
        order.get(a.target)! - order.get(b.target)!,
    );

  const out: PlacedLink[] = [];
  for (const link of sorted) {
    const source = placed.get(link.source)!;
    const target = placed.get(link.target)!;
    const thickness = link.value * scale;
    const y0 = source.y + (rightAt.get(source.id) ?? 0);
    const y1 = target.y + (leftAt.get(target.id) ?? 0);
    rightAt.set(source.id, (rightAt.get(source.id) ?? 0) + thickness);
    leftAt.set(target.id, (leftAt.get(target.id) ?? 0) + thickness);
    const x0 = source.x + NODE_WIDTH;
    const x1 = target.x;
    const mid = (x0 + x1) / 2;
    const n = (value: number) => Math.round(value * 100) / 100;
    out.push({
      ...link,
      d: [
        `M${n(x0)} ${n(y0)}`,
        `C${n(mid)} ${n(y0)} ${n(mid)} ${n(y1)} ${n(x1)} ${n(y1)}`,
        `L${n(x1)} ${n(y1 + thickness)}`,
        `C${n(mid)} ${n(y1 + thickness)} ${n(mid)} ${n(y0 + thickness)} ${n(x0)} ${n(y0 + thickness)}`,
        "Z",
      ].join(""),
    });
  }
  return { nodes: [...placed.values()], links: out };
}
