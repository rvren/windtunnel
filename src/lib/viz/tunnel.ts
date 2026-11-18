/*
 * The wind tunnel's geometry, in the drawing's own units: where the rake
 * and the application stand, and the row each worker's stream runs on.
 * The streams run level, straight into the application and out the other
 * side; the drawing fades them where they touch it, in the shape given by
 * appOutline. Pure.
 */

export const TUNNEL = {
  W: 1000,
  H: 380,
  /** The height the rows are centred on: the middle of the drawing. */
  MID: 190,
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
 * The application's outline, clockwise from its top corner, with its
 * plates `gap` apart (APP.spread while a run is live, APP.rest otherwise).
 */
export function appOutline(gap: number = APP.spread): Point[] {
  const hw = (APP.w * APP.plate.w) / 2;
  const hh = (APP.h * APP.plate.h) / 2;
  const lift = gap * (TUNNEL.W / 100) * Math.sin(rad(APP.tilt));
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

/** The row a worker's stream runs on, centred on the middle. */
export function rowOf(member: number, count: number): number {
  return TUNNEL.MID + (member - (count - 1) / 2) * TUNNEL.ROW_GAP;
}

/**
 * Where a level line at height `y` meets the application: the x where it
 * goes in and the x where it comes out, or null when it passes clear.
 */
export function crossing(
  y: number,
  gap: number = APP.spread,
): [number, number] | null {
  const outline = appOutline(gap);
  const xs: number[] = [];
  outline.forEach(([x0, y0], index) => {
    const [x1, y1] = outline[(index + 1) % outline.length];
    if (y0 === y1 || y < Math.min(y0, y1) || y > Math.max(y0, y1)) return;
    xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
  });
  return xs.length < 2 ? null : [Math.min(...xs), Math.max(...xs)];
}
