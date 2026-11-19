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

// ── The 3D tunnel ─────────────────────────────────────────────────────────
//
// The test section seen from downstream, looking back at the fan: x runs
// with the air (from the fan to the viewer's right), y is up, z comes out
// of the back wall towards the viewer. The open side of the frames faces
// the camera. Everything the drawing places (the camera, the rows, where
// each part sits on its plate) is here, so the labels over the drawing can
// be placed by plain math, before three.js has loaded.

export type Vec3 = [number, number, number];

/*
 * The camera stands well back with a long lens (a narrow field of view):
 * the whole section fits a short, wide drawing, near corners included,
 * and it still looks down on the model by about 10 degrees, so the
 * plates and their parts read.
 */
export const TUNNEL_3D = {
  /** The drawing's width over its height. */
  aspect: 2.75,
  camera: {
    position: [5.11, 2.39, 11.72] as Vec3,
    target: [-0.24, -0.53, -0.55] as Vec3,
    /** The vertical field of view, in degrees. */
    fov: 20.6,
  },
  /** Where the fan turns, the rake stands, the model sits, streams end. */
  fan: -5.7,
  rake: -4.1,
  model: 0.2,
  end: 3.2,
  floor: -1.3,
  ceiling: 1.3,
  /** The fan's radius, inside the wall it comes through. */
  fanRadius: 1.12,
  back: -2,
  near: 2,
  /** The frames along the test section, clear of the model. */
  frames: [-3.3, -2.05, 2.3, 3.5],
  /** Each plate's height, from the top. */
  plateY: { interface: 0.5, services: 0, data: -0.5 },
  plate: { w: 2.1, d: 1.5 },
  /** A part's tile on its plate, and the space between tiles. */
  tile: { w: 0.42, d: 0.3, gapX: 0.48, gapZ: 0.66 },
  /** Fly-off's three designs: how far apart, and how big. */
  designs: { offset: 2.15, scale: 0.52 },
  /** Dogfight's shield, in front of the model. */
  shield: -1.35,
  /**
   * Preflight's board, high on the back wall past the model, where the
   * camera sees it clear of the plates and the names: from the model's x.
   */
  board: { x: 1.35, y: 0.62 },
} as const;

/** The height of each worker's stream, top first, for 1 to 5 workers. */
export function rows3d(count: number): number[] {
  const gap = count <= 2 ? 0.62 : count <= 3 ? 0.58 : count <= 4 ? 0.5 : 0.44;
  return Array.from(
    { length: count },
    (_, index) => ((count - 1) / 2 - index) * gap,
  );
}

/**
 * Where each of `count` parts sits on its plate, from the plate's centre:
 * [x, z], four to a row, centred.
 */
export function partSpots(count: number): [number, number][] {
  const { gapX, gapZ } = TUNNEL_3D.tile;
  const lines = Math.ceil(count / 4);
  return Array.from({ length: count }, (_, index) => {
    const line = Math.floor(index / 4);
    const inLine = Math.min(4, count - line * 4);
    const column = index % 4;
    return [
      (column - (inLine - 1) / 2) * gapX,
      (line - (lines - 1) / 2) * gapZ,
    ];
  });
}

/** Where the model stands: one, or Fly-off's three designs in a row. */
export function modelSpots(designs: number): number[] {
  const { model } = TUNNEL_3D;
  if (designs <= 1) return [model];
  const { offset } = TUNNEL_3D.designs;
  return Array.from(
    { length: designs },
    (_, index) => model + (index - (designs - 1) / 2) * offset,
  );
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/**
 * Where a point of the scene lands in the drawing, as fractions of its
 * width (x, from the left) and height (y, from the top): the same
 * projection as the 3D camera, so a label sits on what it names.
 */
export function project(
  point: Vec3,
  aspect: number = TUNNEL_3D.aspect,
): { x: number; y: number } {
  const { position, target, fov } = TUNNEL_3D.camera;
  const forward = unit(sub(target, position));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d = sub(point, position);
  const depth = dot(d, forward);
  const half = Math.tan((fov * Math.PI) / 360);
  const nx = dot(d, right) / depth / (half * aspect);
  const ny = dot(d, up) / depth / half;
  return { x: (nx + 1) / 2, y: (1 - ny) / 2 };
}
