/*
 * Where each part of an architecture sits: in columns from left to right,
 * callers before what they call. Pure, so it is tested without a browser.
 * Drawn by components/project/architecture-diagram.tsx.
 */

export interface LayoutComponent {
  id: string;
  kind: string;
}

export interface LayoutConnection {
  from: string;
  to: string;
}

const CODE = new Set(["frontend", "service", "library", "other"]);

/**
 * The column of each component. Frontends come first. Code follows the
 * calls: a part sits one column after the last part that calls it. Things
 * with no code of their own (databases, queues, outside systems) share the
 * last column.
 */
export function layerComponents(
  components: LayoutComponent[],
  connections: LayoutConnection[],
): string[][] {
  const code = components.filter((item) => CODE.has(item.kind));
  const ids = new Set(code.map((item) => item.id));
  const depth = new Map<string, number>();
  for (const item of code) depth.set(item.id, item.kind === "frontend" ? 0 : 1);
  // Longest path from the left. Bounded, so a cycle cannot loop for ever.
  for (let pass = 0; pass < code.length; pass += 1) {
    let moved = false;
    for (const { from, to } of connections) {
      if (!ids.has(from) || !ids.has(to)) continue;
      const next = depth.get(from)! + 1;
      if (next > depth.get(to)! && next <= code.length) {
        depth.set(to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const columns = new Map<number, string[]>();
  for (const item of code) {
    const column = depth.get(item.id)!;
    columns.set(column, [...(columns.get(column) ?? []), item.id]);
  }
  const layers = [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => items);
  const rest = components
    .filter((item) => !CODE.has(item.kind))
    .map((item) => item.id);
  if (rest.length > 0) layers.push(rest);

  // Within a column, sit near what calls you: order by the mean height of
  // the callers in the columns before, each as a share of its own column.
  const height = new Map<string, number>();
  const place = (layer: string[]) =>
    layer.forEach((id, row) => height.set(id, (row + 0.5) / layer.length));
  if (layers[0]) place(layers[0]);
  for (let index = 1; index < layers.length; index += 1) {
    const weight = (id: string) => {
      const callers = connections
        .filter((connection) => connection.to === id)
        .map((connection) => height.get(connection.from))
        .filter((value): value is number => value !== undefined);
      return callers.length > 0
        ? callers.reduce((sum, value) => sum + value, 0) / callers.length
        : Number.MAX_SAFE_INTEGER;
    };
    const order = new Map(layers[index].map((id, row) => [id, row]));
    layers[index] = [...layers[index]].sort(
      (a, b) => weight(a) - weight(b) || order.get(a)! - order.get(b)!,
    );
    place(layers[index]);
  }
  return layers;
}
