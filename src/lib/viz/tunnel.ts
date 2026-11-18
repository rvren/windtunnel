/*
 * The wind tunnel's geometry, in the drawing's own units: where the rake
 * and the application stand, and the path each stream takes. The streams
 * part round the application, some over it and some under, as air parts
 * round a model in a real tunnel, and none may touch it; the unit test
 * holds that. Pure.
 */

export const TUNNEL = {
  W: 1000,
  H: 410,
  /** The height the rows are centred on: the middle of the drawing. */
  MID: 205,
  /** The rake, where the streams start. */
  RAKE: 222,
  FROM: 227,
  /** Where the streams end, beside the workers' names. */
  TO: 780,
  /** The space between two workers' rows. */
  ROW_GAP: 46,
} as const;

/**
 * The application: three plates seen from above at an angle. `spread` and
 * `rest` are how far apart the plates float, live and at rest, in hundredths
 * of the drawing's width (the CSS unit cqw).
 */
export const APP = {
  x: 540,
  y: TUNNEL.MID,
  w: 210,
  h: 300,
  /** The plate inside the box: its share of the box's width and height. */
  plate: { w: 0.76, h: 0.56 },
  tilt: 60,
  turn: 40,
  spread: 9,
  rest: 6.5,
} as const;

type Point = [number, number];
export type Side = "over" | "under";

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** A plate's corner on screen, from the application's centre. */
function corner(px: number, py: number): Point {
  const cos = Math.cos(rad(APP.turn));
  const sin = Math.sin(rad(APP.turn));
  return [
    px * cos + py * sin,
    Math.cos(rad(APP.tilt)) * (-px * sin + py * cos),
  ];
}

/**
 * The application's outline while its plates are spread (the widest it
 * gets), clockwise from its top corner.
 */
export function appOutline(): Point[] {
  const hw = (APP.w * APP.plate.w) / 2;
  const hh = (APP.h * APP.plate.h) / 2;
  const lift = APP.spread * (TUNNEL.W / 100) * Math.sin(rad(APP.tilt));
  const at = ([x, y]: Point, dy: number): Point => [APP.x + x, APP.y + y + dy];
  return [
    at(corner(hw, -hh), -lift),
    at(corner(hw, hh), -lift),
    at(corner(hw, hh), lift),
    at(corner(-hw, hh), lift),
    at(corner(-hw, -hh), lift),
    at(corner(-hw, -hh), -lift),
  ];
}

/**
 * The height of the application's upper edge ("over") or lower edge
 * ("under") at `x`, or null beside it.
 */
export function edgeAt(x: number, side: Side): number | null {
  const [top, rightTop, rightBottom, bottom, leftBottom, leftTop] =
    appOutline();
  const [left, peak, right] =
    side === "over"
      ? [leftTop, top, rightTop]
      : [leftBottom, bottom, rightBottom];
  if (x < left[0] || x > right[0]) return null;
  const [from, to] = x < peak[0] ? [left, peak] : [peak, right];
  const share = (x - from[0]) / (to[0] - from[0]);
  return from[1] + share * (to[1] - from[1]);
}

/** The row a worker's stream starts and ends on, centred on the middle. */
export function rowOf(member: number, count: number): number {
  return TUNNEL.MID + (member - (count - 1) / 2) * TUNNEL.ROW_GAP;
}

/** Whether a worker's stream goes over the application or under it. */
export function sideOf(member: number, count: number): Side {
  return member < Math.ceil(count / 2) ? "over" : "under";
}

/** How far the stream nearest the application stays from it, and each one more. */
const CLEAR = 20;
const LAYER = 18;
/** How gently a stream turns away before the application, and back after it. */
const RISE = 0.8;
const RETURN = 0.9;
const STEP = 4;

/**
 * A smooth curve through points that never overshoots them (a monotone
 * cubic, after Fritsch and Carlson): level where the points are level, and
 * rounded at a crest. Returns its height at `x`.
 */
function smoothThrough(knots: Point[]): (x: number) => number {
  const n = knots.length;
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    slope.push(
      (knots[i + 1][1] - knots[i][1]) / (knots[i + 1][0] - knots[i][0]),
    );
  }
  const tangent = knots.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const [a, b] = [slope[i - 1], slope[i]];
    // Level, or a crest: no slope there. Otherwise between the two sides.
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return (x: number) => {
    let i = 0;
    while (i < n - 2 && x > knots[i + 1][0]) i += 1;
    const [x0, y0] = knots[i];
    const [x1, y1] = knots[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * y0 +
      (t ** 3 - 2 * t ** 2 + t) * h * tangent[i] +
      (-2 * t ** 3 + 3 * t ** 2) * y1 +
      (t ** 3 - t ** 2) * h * tangent[i + 1]
    );
  };
}

/**
 * The path of one worker's stream, as points from the rake to its end:
 * one smooth curve. It runs level, eases away before the application,
 * rounds its nearest corner, its crest and its far corner at its own
 * distance (the stream nearest the middle closest), and eases back to its
 * row behind it.
 */
export function streamPoints(member: number, count: number): Point[] {
  const [top, rightTop, rightBottom, bottom, leftBottom, leftTop] =
    appOutline();
  const side = sideOf(member, count);
  const overs = Math.ceil(count / 2);
  const [left, peak, right] =
    side === "over"
      ? [leftTop, top, rightTop]
      : [leftBottom, bottom, rightBottom];
  const level = side === "over" ? overs - 1 - member : member - overs;
  const row = rowOf(member, count);
  const clear = CLEAR + level * LAYER;
  const out = 6 + 4 * level;
  // Never nearer the application than the row itself.
  const off = (y: number) =>
    side === "over" ? Math.min(row, y - clear) : Math.max(row, y + clear);
  const near: Point = [left[0] - out, off(left[1])];
  const crest: Point = [peak[0], off(peak[1])];
  const far: Point = [right[0] + out, off(right[1])];
  const start = Math.max(
    TUNNEL.FROM + 12,
    near[0] - Math.max(80, Math.abs(row - near[1]) / RISE),
  );
  const end = Math.min(
    TUNNEL.TO - 12,
    far[0] + Math.max(70, Math.abs(row - far[1]) / RETURN),
  );
  const height = smoothThrough([
    [TUNNEL.FROM, row],
    [start, row],
    near,
    crest,
    far,
    [end, row],
    [TUNNEL.TO, row],
  ]);

  const points: Point[] = [];
  for (let x = TUNNEL.FROM; x < TUNNEL.TO; x += STEP) {
    points.push([x, Math.round(height(x) * 10) / 10]);
  }
  points.push([TUNNEL.TO, row]);
  points[0] = [TUNNEL.FROM, row];
  return points;
}

/** Points as an SVG path. */
export function pathOf(points: Point[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`)
    .join(" ");
}

/** The point of a path nearest to `x`. */
export function pointAt(points: Point[], x: number): Point {
  return points.reduce((best, point) =>
    Math.abs(point[0] - x) < Math.abs(best[0] - x) ? point : best,
  );
}
