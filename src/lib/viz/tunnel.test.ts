import { describe, expect, it } from "vitest";

import { APP, TUNNEL, appOutline, crossing, rowOf } from "./tunnel";

describe("the application's outline", () => {
  it("floats in the middle of the drawing, with room over and under", () => {
    const ys = appOutline().map(([, y]) => y);
    expect(Math.min(...ys)).toBeGreaterThan(40);
    expect(Math.max(...ys)).toBeLessThan(TUNNEL.H - 40);
  });

  it("stands between the rake and the ends of the streams", () => {
    const xs = appOutline().map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThan(TUNNEL.FROM + 100);
    expect(Math.max(...xs)).toBeLessThan(TUNNEL.TO - 80);
  });

  it("is smaller at rest than while a run is live", () => {
    const height = (gap: number) => {
      const ys = appOutline(gap).map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(APP.rest)).toBeLessThan(height(APP.spread));
  });
});

describe("the rows", () => {
  it("are centred on the middle and evenly apart", () => {
    expect([0, 1, 2, 3, 4].map((member) => rowOf(member, 5))).toEqual([
      TUNNEL.MID - 2 * TUNNEL.ROW_GAP,
      TUNNEL.MID - TUNNEL.ROW_GAP,
      TUNNEL.MID,
      TUNNEL.MID + TUNNEL.ROW_GAP,
      TUNNEL.MID + 2 * TUNNEL.ROW_GAP,
    ]);
    expect(rowOf(0, 2) + rowOf(1, 2)).toBe(2 * TUNNEL.MID);
  });

  it("all run through the application, so each stream fades into it", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      for (let member = 0; member < count; member += 1) {
        const hit = crossing(rowOf(member, count));
        expect(hit, `row ${member} of ${count}`).not.toBeNull();
        expect(hit![1] - hit![0]).toBeGreaterThan(60);
      }
    }
  });
});

describe("crossing", () => {
  it("is null for a line that passes clear of the application", () => {
    expect(crossing(4)).toBeNull();
    expect(crossing(TUNNEL.H - 4)).toBeNull();
  });

  it("is widest across the application's middle", () => {
    const mid = crossing(APP.y)!;
    const high = crossing(rowOf(0, 5))!;
    expect(mid[1] - mid[0]).toBeGreaterThan(high[1] - high[0]);
  });
});
