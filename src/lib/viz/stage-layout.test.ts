import { describe, expect, it } from "vitest";

import type { FlowView } from "./cockpit-views";
import {
  COMPACT_HALO,
  COMPACT_MIN,
  HALO,
  LABEL,
  RING,
  TICKS,
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
        const ring = node.compact
          ? COMPACT_HALO
          : node.column === 0
            ? HALO
            : TICKS;
        const below = node.compact ? node.r + ring : node.r + LABEL;
        expect(node.y - node.r - ring).toBeGreaterThanOrEqual(-0.001);
        expect(node.y + below).toBeLessThanOrEqual(height + 0.001);
        expect(node.r).toBeLessThanOrEqual(RING.max);
        expect(node.r).toBeGreaterThanOrEqual(COMPACT_MIN);
      }
      for (const node of layout.sources.filter((n) => !n.compact)) {
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

  it("shows every node however many there are, names beside when crowded", () => {
    const roomy = layoutStage(view(4), { width: 1100, height: 900 });
    const crowded = layoutStage(view(12), { width: 1100, height: 400 });
    expect(roomy.sources).toHaveLength(4);
    expect(roomy.sources.every((node) => !node.compact)).toBe(true);
    expect(crowded.sources).toHaveLength(12);
    expect(crowded.sources.every((node) => node.compact)).toBe(true);
    // Every band still runs: none is merged away.
    expect(crowded.bands).toHaveLength(view(12).bands.length);
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

  it("drops listed items when a group is short of room", () => {
    const roomy = layoutStage(view(4), { width: 1100, height: 900 });
    const tight = layoutStage(view(4), { width: 1100, height: 300 });
    expect(roomy.groups.every((group) => group.leaves === 3)).toBe(true);
    expect(tight.groups.every((group) => group.leaves < 3)).toBe(true);
    expect(tight.groups).toHaveLength(4);
  });

  it("keeps every group's words inside the box", () => {
    for (const height of [300, 420, 640]) {
      const layout = layoutStage(view(6), { width: 1100, height });
      for (const group of layout.groups) {
        const block = Math.min(height / 4, 42) + group.leaves * 16;
        expect(group.top).toBeGreaterThanOrEqual(0);
        expect(group.top + block).toBeLessThanOrEqual(height + 0.001);
      }
    }
  });
});
