import { describe, expect, it } from "vitest";

import * as THREE from "three";

import {
  APP,
  TUNNEL,
  TUNNEL_3D,
  appOutline,
  crossing,
  modelSpots,
  partSpots,
  project,
  rowOf,
  rows3d,
  type Vec3,
} from "./tunnel";

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

describe("the 3D tunnel", () => {
  it("places labels exactly where three.js's camera puts them", () => {
    const camera = new THREE.PerspectiveCamera(
      TUNNEL_3D.camera.fov,
      TUNNEL_3D.aspect,
      0.1,
      80,
    );
    camera.position.set(...TUNNEL_3D.camera.position);
    camera.lookAt(...TUNNEL_3D.camera.target);
    camera.updateMatrixWorld();
    for (const point of [
      [TUNNEL_3D.end + 0.3, 0.6, 0],
      [TUNNEL_3D.model, 0.5, -0.4],
      [TUNNEL_3D.fan, 0, 0],
    ] as Vec3[]) {
      const ndc = new THREE.Vector3(...point).project(camera);
      const ours = project(point);
      expect(ours.x).toBeCloseTo((ndc.x + 1) / 2, 6);
      expect(ours.y).toBeCloseTo((1 - ndc.y) / 2, 6);
    }
  });

  it("keeps every worker's name inside the drawing, and apart", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const labels = rows3d(count).map((y) =>
        project([TUNNEL_3D.end + 0.3, y, 0]),
      );
      for (const label of labels) {
        expect(label.x).toBeGreaterThan(0.6);
        // Room on the right for the longest name and the count.
        expect(label.x).toBeLessThan(0.8);
        expect(label.y).toBeGreaterThan(0.12);
        expect(label.y).toBeLessThan(0.88);
      }
      // At least a line of text apart at the drawing's smallest size.
      for (let index = 1; index < labels.length; index += 1) {
        expect(labels[index].y - labels[index - 1].y).toBeGreaterThan(0.06);
      }
    }
  });

  it("sets the streams top first, centred on the middle", () => {
    expect(rows3d(1)).toEqual([0]);
    const five = rows3d(5);
    expect(five[0]).toBeGreaterThan(five[4]);
    expect(five[0] + five[4]).toBeCloseTo(0);
  });

  it("lays parts four to a row, centred on the plate", () => {
    expect(partSpots(1)).toEqual([[0, 0]]);
    const six = partSpots(6);
    expect(six).toHaveLength(6);
    expect(new Set(six.map(([, z]) => z)).size).toBe(2);
    expect(six[0][0] + six[3][0]).toBeCloseTo(0);
  });

  it("stands Fly-off's three designs apart, the middle one on the mark", () => {
    const spots = modelSpots(3);
    expect(spots[1]).toBe(TUNNEL_3D.model);
    expect(spots[0]).toBeLessThan(spots[1]);
    expect(modelSpots(1)).toEqual([TUNNEL_3D.model]);
  });
});
