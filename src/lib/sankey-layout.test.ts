import { describe, expect, it } from "vitest";

import { layoutFlow } from "./sankey-layout";

describe("layoutFlow", () => {
  const nodes = [
    { id: "a", column: 0, value: 3 },
    { id: "b", column: 0, value: 1 },
    { id: "x", column: 1, value: 4 },
    { id: "p", column: 2, value: 2 },
    { id: "q", column: 2, value: 2 },
  ];
  const links = [
    { source: "a", target: "x", value: 3 },
    { source: "b", target: "x", value: 1 },
    { source: "x", target: "p", value: 2 },
    { source: "x", target: "q", value: 2 },
    { source: "x", target: "nowhere", value: 9 },
  ];
  const layout = layoutFlow(nodes, links, { width: 400, height: 200, gap: 10 });

  it("keeps every node inside the chart, with heights in proportion", () => {
    const byId = Object.fromEntries(
      layout.nodes.map((node) => [node.id, node]),
    );
    expect(byId.a.height / byId.b.height).toBeCloseTo(3);
    for (const node of layout.nodes) {
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y + node.height).toBeLessThanOrEqual(200.001);
    }
    expect(byId.a.x).toBe(0);
    expect(byId.p.x).toBeGreaterThan(byId.x.x);
  });

  it("stacks the nodes of a column without overlap", () => {
    const [a, b] = layout.nodes.filter((node) => node.column === 0);
    expect(b.y).toBeCloseTo(a.y + a.height + 10);
  });

  it("draws one band per link that joins two nodes", () => {
    expect(layout.links).toHaveLength(4);
    expect(layout.links.every((link) => link.d.startsWith("M"))).toBe(true);
  });

  it("gives nothing for no nodes", () => {
    expect(layoutFlow([], [], { width: 1, height: 1, gap: 0 })).toEqual({
      nodes: [],
      links: [],
    });
  });
});
