import { describe, expect, it } from "vitest";

import type { FlowView } from "./cockpit-views";
import {
  HALO,
  LABEL,
  RING,
  TICKS,
  foldColumn,
  layoutStage,
} from "./stage-layout";

/** A view with `sources` places, three kinds and four severities. */
function view(sources: number): FlowView {
  const tones = ["red", "orange", "violet", "grey"];
  const bands: FlowView["bands"] = [];
  for (let s = 0; s < sources; s += 1) {
    bands.push({
      source: `source:${s}`,
      target: `hub:${s % 3}`,
      value: s + 1,
      tone: tones[s % 4],
    });
    bands.push({
      source: `hub:${s % 3}`,
      target: `group:${s % 4}`,
      value: s + 1,
      tone: tones[s % 4],
    });
  }
  const sum = (pick: (b: FlowView["bands"][number]) => boolean) =>
    bands.filter(pick).reduce((total, b) => total + b.value, 0);
  return {
    heading: ["Places", "Kinds", "Severity"],
    note: "",
    legend: [],
    sources: Array.from({ length: sources }, (_, s) => ({
      id: `source:${s}`,
      label: `place ${s}`,
      value: s + 1,
    })),
    hubs: [0, 1, 2].map((h) => ({
      id: `hub:${h}`,
      label: `kind ${h}`,
      value: sum((b) => b.target === `hub:${h}`),
    })),
    groups: [0, 1, 2, 3].map((g) => ({
      id: `group:${g}`,
      label: `severity ${g}`,
      value: sum((b) => b.target === `group:${g}`),
      leaves: [0, 1, 2].map((l) => ({ id: `${g}-${l}`, label: `issue ${l}` })),
      more: 0,
    })),
    bands,
  };
}

describe("a flow laid out to fit one box", () => {
  it("keeps every node inside the box, at any height", () => {
    for (const height of [360, 480, 640, 900]) {
      const layout = layoutStage(view(7), { width: 1100, height });
      // A ring, its halo or ticks, and its label all stay in the box.
      for (const node of [...layout.sources, ...layout.hubs]) {
        const ring = node.column === 0 ? HALO : TICKS;
        expect(node.y - node.r - ring).toBeGreaterThanOrEqual(-0.001);
        expect(node.y + node.r + LABEL).toBeLessThanOrEqual(height + 0.001);
        expect(node.r).toBeLessThanOrEqual(RING.max);
      }
      for (const node of layout.sources) {
        expect(node.r).toBeGreaterThanOrEqual(RING.min);
      }
    }
  });

  it("spaces a column's nodes evenly", () => {
    const layout = layoutStage(view(4), { width: 1100, height: 600 });
    const ys = layout.sources.map((node) => node.y);
    const steps = ys.slice(1).map((y, i) => y - ys[i]);
    expect(new Set(steps.map((step) => step.toFixed(3))).size).toBe(1);
  });

  it("folds what does not fit into one node, and keeps the totals", () => {
    const tall = layoutStage(view(9), { width: 1100, height: 900 });
    const short = layoutStage(view(9), { width: 1100, height: 360 });
    expect(tall.sources.some((node) => node.folded)).toBe(false);
    expect(short.sources.some((node) => node.folded)).toBe(true);
    const total = (layout: typeof short) =>
      layout.sources.reduce((sum, node) => sum + node.data.value, 0);
    expect(total(short)).toBe(total(tall));
    // Bands from folded places now leave from the fold, with the same sum.
    const out = (layout: typeof short) =>
      layout.bands
        .filter(
          (band) =>
            band.source.startsWith("source:") ||
            band.source.startsWith("more:0"),
        )
        .reduce((sum, band) => sum + band.value, 0);
    expect(out(short)).toBe(out(tall));
  });

  it("fits each node's bands inside its ring", () => {
    const layout = layoutStage(view(6), { width: 1100, height: 640 });
    for (const node of [...layout.sources, ...layout.hubs]) {
      const leaving = layout.bands
        .filter((band) => band.source === node.id)
        .reduce((sum, band) => sum + band.thickness, 0);
      const entering = layout.bands
        .filter((band) => band.target === node.id)
        .reduce((sum, band) => sum + band.thickness, 0);
      expect(Math.max(leaving, entering)).toBeLessThanOrEqual(
        node.r * 1.6 + 0.001,
      );
    }
  });

  it("drops listed items before it folds a group", () => {
    const roomy = layoutStage(view(4), { width: 1100, height: 900 });
    const tight = layoutStage(view(4), { width: 1100, height: 300 });
    expect(roomy.groups.every((group) => group.leaves === 3)).toBe(true);
    expect(tight.groups.every((group) => group.leaves < 3)).toBe(true);
    expect(tight.groups.some((group) => group.folded)).toBe(false);
  });

  it("folds a column to one node when even two do not fit", () => {
    const nodes = [1, 2, 3].map((v) => ({ id: `n${v}`, label: "", value: v }));
    const { nodes: kept, into } = foldColumn(nodes, 1, 0);
    expect(kept).toHaveLength(1);
    expect(kept[0].value).toBe(6);
    expect(into.size).toBe(3);
  });
});
