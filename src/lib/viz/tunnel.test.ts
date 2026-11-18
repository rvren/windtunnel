import { describe, expect, it } from "vitest";

import {
  TUNNEL,
  appOutline,
  edgeAt,
  rowOf,
  sideOf,
  streamPoints,
} from "./tunnel";

describe("the application's outline", () => {
  it("floats in the middle of the drawing, with room over and under", () => {
    const ys = appOutline().map(([, y]) => y);
    expect(Math.min(...ys)).toBeGreaterThan(60);
    expect(Math.max(...ys)).toBeLessThan(TUNNEL.H - 60);
  });

  it("has edges only over and under itself", () => {
    const [top, right, , bottom, , left] = appOutline();
    expect(edgeAt(left[0] - 1, "over")).toBeNull();
    expect(edgeAt(right[0] + 1, "under")).toBeNull();
    expect(edgeAt(top[0], "over")).toBeCloseTo(top[1], 5);
    expect(edgeAt(bottom[0], "under")).toBeCloseTo(bottom[1], 5);
  });
});

describe("streamPoints", () => {
  const counts = [1, 2, 3, 4, 5];

  it("runs from the rake to its end on its own row", () => {
    for (const count of counts) {
      for (let member = 0; member < count; member += 1) {
        const points = streamPoints(member, count);
        const row = rowOf(member, count);
        expect(points[0]).toEqual([TUNNEL.FROM, row]);
        expect(points.at(-1)).toEqual([TUNNEL.TO, row]);
        // Left to right, never back.
        expect(
          points.every((point, i) => i === 0 || point[0] > points[i - 1][0]),
        ).toBe(true);
      }
    }
  });

  it("parts the streams: the upper half over, the rest under", () => {
    expect([0, 1, 2, 3, 4].map((member) => sideOf(member, 5))).toEqual([
      "over",
      "over",
      "over",
      "under",
      "under",
    ]);
    expect([0, 1].map((member) => sideOf(member, 2))).toEqual([
      "over",
      "under",
    ]);
  });

  it("goes round the application and never touches it", () => {
    for (const count of counts) {
      for (let member = 0; member < count; member += 1) {
        const side = sideOf(member, count);
        for (const [x, y] of streamPoints(member, count)) {
          const edge = edgeAt(x, side);
          if (edge !== null) {
            const gap = side === "over" ? edge - y : y - edge;
            expect(gap, `stream ${member}/${count} at ${x}`).toBeGreaterThan(8);
          }
          // And stays inside the drawing.
          expect(y).toBeGreaterThan(8);
          expect(y).toBeLessThan(TUNNEL.H - 8);
        }
      }
    }
  });

  it("keeps the streams apart: none crosses another", () => {
    for (const count of counts) {
      for (let member = 1; member < count; member += 1) {
        const upper = streamPoints(member - 1, count);
        const lower = streamPoints(member, count);
        expect(
          lower.every(([, y], index) => y - upper[index][1] > 6),
          `streams ${member - 1} and ${member} of ${count}`,
        ).toBe(true);
      }
    }
  });
});
