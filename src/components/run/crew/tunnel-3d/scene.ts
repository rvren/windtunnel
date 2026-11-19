import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { TUNNEL_3D, modelSpots, rows3d } from "@/lib/viz/tunnel";
import {
  partPositions,
  type PlateId,
  type SceneTone,
  type TunnelScene,
} from "@/lib/viz/tunnel-scene";
import type { AgentStatus, LineStatus } from "@/server/engine/schema";

import { css, type Palette, type Rgb } from "./colors";

/*
 * The 3D wind tunnel: a test section seen from downstream, looking back at
 * its fan. The fan turns in its duct behind a flared, matte inlet, with
 * stator vanes behind it; the section is a matte floor, a matte back wall
 * and a faint glass ceiling, with no bars along it, open on the side
 * that faces us, with no frames across it (the owner found them noisy). The application stands on a turntable in the
 * middle: three plates on a sting (its interface, its services, its data),
 * each part of it a tile. One fine stream per worker comes out of the fan; a
 * light travels a stream while its worker works, the stream fades inside
 * the model, and ends in a dot beside the worker's name (the names are
 * HTML over the drawing). When the run ends the fan stops and each stream
 * turns green, or red where work failed.
 *
 * What each kind adds comes from src/lib/viz/tunnel-scene.ts; where things
 * stand, from TUNNEL_3D in src/lib/viz/tunnel.ts.
 *
 * The scene renders only while something moves and it is on screen. Every
 * changing value eases towards its target, so new data shows smoothly;
 * with reduced motion it jumps there, and nothing turns or travels.
 */

const T = TUNNEL_3D;
const PLATES: PlateId[] = ["interface", "services", "data"];
/**
 * The turbine's finish: matte, like anodised or painted metal, so the fan,
 * its nose and its lip hold their shape without bright reflections.
 */
const MATTE = { metalness: 0.35, roughness: 0.72 } as const;

/** How fast the fan turns once the run is over, in radians a second. */
const IDLE_SPIN = 0.9;

/**
 * A symmetric aerofoil section (NACA 00xx), as struts in a real tunnel
 * are faired: `chord` along the flow (x, leading edge upstream), `thick`
 * its greatest thickness across it.
 */
function aerofoil(chord: number, thick: number): THREE.Shape {
  const t = thick / chord;
  const half = (x: number) =>
    5 *
    t *
    chord *
    (0.2969 * Math.sqrt(x) -
      0.126 * x -
      0.3516 * x ** 2 +
      0.2843 * x ** 3 -
      0.1036 * x ** 4);
  const shape = new THREE.Shape();
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const x = (1 - Math.cos((i / steps) * Math.PI)) / 2;
    const at = [x * chord - chord / 2, half(x)] as const;
    if (i === 0) shape.moveTo(...at);
    else shape.lineTo(...at);
  }
  for (let i = steps - 1; i > 0; i -= 1) {
    const x = (1 - Math.cos((i / steps) * Math.PI)) / 2;
    shape.lineTo(x * chord - chord / 2, -half(x));
  }
  shape.closePath();
  return shape;
}

/** A faired strut standing from `from` to `to` (heights). */
function strutGeometry(chord: number, thick: number, from: number, to: number) {
  const geometry = new THREE.ExtrudeGeometry(aerofoil(chord, thick), {
    depth: to - from,
    bevelEnabled: false,
    curveSegments: 8,
  });
  // Extruded along z; stood up along y, its thickness across the flow.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, from, 0);
  geometry.computeVertexNormals();
  return geometry;
}

let shadowTexture: THREE.Texture | null = null;

/**
 * A soft shadow's shape: dark in the middle, fading out to nothing at the
 * edges. Drawn once and shared.
 */
function contactShadow(): THREE.Texture {
  if (shadowTexture) return shadowTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const fade = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    fade.addColorStop(0, "rgba(255,255,255,0.9)");
    fade.addColorStop(0.45, "rgba(255,255,255,0.55)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = fade;
    context.fillRect(0, 0, size, size);
  }
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}

/**
 * A solid slab, `w` by `d` and `t` thick, its corners rounded by `r` and
 * its edges softly bevelled: the floor and the back wall. Its face is the
 * plane z = 0, facing +z; its body lies behind it.
 */
function slabGeometry(w: number, d: number, t: number, r: number) {
  const bevel = 0.02;
  const geometry = new THREE.ExtrudeGeometry(
    rounded(new THREE.Shape(), w - bevel * 2, d - bevel * 2, r),
    {
      depth: t - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 16,
    },
  );
  geometry.translate(0, 0, -t + bevel);
  return geometry;
}

/**
 * One fan blade, in the fan's own frame (radial along y, turning about z):
 * a cambered surface that widens and sweeps towards its tip and twists
 * from steep at the hub to flat at the tip, as a turbofan's do.
 */
function bladeGeometry(hub: number, tip: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, 6, 18);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i); // -0.5 .. 0.5 across the chord
    const s = position.getY(i) + 0.5; // 0 at the hub, 1 at the tip
    const r = hub + s * (tip - hub);
    const chord = 0.2 + 0.18 * s;
    const twist = 1.05 - 0.55 * s;
    const camber = (0.25 - u * u) * chord * 0.22;
    const along = u * chord;
    const sweep = s * s * 0.12;
    position.setXYZ(
      i,
      along * Math.cos(twist) - camber * Math.sin(twist) + sweep,
      r,
      along * Math.sin(twist) + camber * Math.cos(twist),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

const PLATE_OPACITY: Record<PlateId, number> = {
  interface: 0.82,
  services: 0.9,
  data: 0.95,
};

export interface StreamInput {
  id: string;
  status: AgentStatus;
  /** A duel's attacker runs red. */
  danger: boolean;
  /** Its newest result while the run goes on: a spark leaves the model. */
  latest: string | null;
}

export interface TunnelInput {
  streams: StreamInput[];
  scene: TunnelScene;
  subject: string;
  ended: boolean;
  outcome: "completed" | "failed" | null;
}

type Verdict = "good" | "bad" | null;

/** How a worker's stream ends once the run is over, as in the 2D tunnel. */
function verdictOf(
  status: AgentStatus,
  outcome: TunnelInput["outcome"],
): Verdict {
  if (!outcome || status === "pending") return null;
  if (outcome === "completed") {
    return status === "failed" || status === "declined" ? "bad" : "good";
  }
  return status === "done" ? "good" : "bad";
}

// The stream: a fine tube whose light fades in out of the fan, fades out
// before its end, fades inside the model, and carries a travelling light
// while its worker works.
const STREAM_VERTEX = `
varying float vx;
void main() {
  vx = (modelMatrix * vec4(position, 1.0)).x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STREAM_FRAGMENT = `
uniform vec3 color;
uniform float alpha, pulse, on, fade0, fade1, from, to, gain;
varying float vx;
void main() {
  float a = alpha * smoothstep(from, from + 0.9, vx) * (1.0 - smoothstep(to - 0.35, to, vx));
  float inside = smoothstep(fade0 - 0.35, fade0, vx) * (1.0 - smoothstep(fade1, fade1 + 0.35, vx));
  a *= 1.0 - 0.88 * inside;
  float light = on * exp(-pow((vx - pulse) / 0.45, 2.0)) * (1.0 - 0.85 * inside);
  gl_FragColor = vec4(color * (1.0 + light * gain), clamp(a + light * 0.85, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

interface Stream {
  id: string;
  y: number;
  index: number;
  core: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
  glow: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
  dot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  color: THREE.Color;
  target: THREE.Color;
  alpha: number;
  alphaTarget: number;
  running: boolean;
  /** Done, and not failed: the air keeps flowing down it. */
  flowing: boolean;
  /** How far its light has travelled. */
  travel: number;
  latest: string | null;
}

interface Tile {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial[]>;
  edges: THREE.LineSegments | null;
  glow: number;
  glowTarget: number;
  tone: SceneTone;
  opacity: number;
  opacityTarget: number;
  pins: number;
}

interface Model {
  group: THREE.Group;
  plates: Record<PlateId, THREE.Group>;
  plateMaterials: THREE.MeshStandardMaterial[];
  edges: THREE.LineBasicMaterial[];
  lift: number;
  liftTarget: number;
  dim: number;
  dimTarget: number;
}

interface Effect {
  start: number;
  duration: number;
  step: (k: number) => void;
  done?: () => void;
}

interface Arc {
  mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  count: number;
}

interface Shield {
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  opacity: number;
}

/** Eases a value towards its target; `rate` is how fast, per second. */
const approach = (now: number, target: number, dt: number, rate = 5) =>
  Math.abs(target - now) < 0.002
    ? target
    : now + (target - now) * Math.min(1, dt * rate);

function rounded<P extends THREE.Path>(
  path: P,
  w: number,
  h: number,
  r: number,
  /** Where its middle is along its width. */
  middle = 0,
): P {
  const x = middle - w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

export class Tunnel3D {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Scene();
  /** What one input builds; rebuilt when the cast or the parts change. */
  private stage = new THREE.Group();
  private palette: Palette;
  private reduced: boolean;
  private visible = true;
  private frameId = 0;
  private last = 0;
  private clock = 0;
  private fan!: THREE.Group;
  private fanSpeed = 0;
  private fanTarget = 0;
  /** Nothing at work and nothing landing: frames are drawn more slowly. */
  private idle = false;
  private fanLight!: THREE.PointLight;
  /** The blades blurred into a disc at speed, as a real fan looks. */
  private fanBlur!: THREE.MeshBasicMaterial;
  /** The light the metal and glass reflect: a soft studio room. */
  private environment: THREE.Texture | null = null;
  /** The dark theme's glow: lights that bloom. Null in the light theme. */
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private ductGlow!: THREE.MeshBasicMaterial;
  private key = "";
  private first = true;
  private input: TunnelInput | null = null;
  private streams: Stream[] = [];
  private models: Model[] = [];
  private tiles = new Map<string, Tile>();
  private spots = new Map<string, THREE.Vector3>();
  private arcs = new Map<string, Arc>();
  private pins = new Set<string>();
  private effects: Effect[] = [];
  private beacon: {
    core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    halo: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    settled: boolean;
  } | null = null;
  private shields: Shield[] = [];
  private judged = 0;
  private lights: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] =
    [];
  private scan: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private jets: {
    tube: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
    bead: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    from: THREE.Vector3;
    to: THREE.Vector3;
    phase: number;
  }[] = [];
  private flown = new Set<string>();
  /**
   * What the pointer can find, by key (`kind:id`, src/lib/viz/tunnel-tips.ts):
   * its object, how near on screen the pointer must come, and whether it
   * is small (a ball), which wins over a large thing (a tile, a design).
   */
  private picks = new Map<
    string,
    { object: THREE.Object3D; radius: number; small: boolean }
  >();
  private hovered: {
    key: string;
    object: THREE.Object3D;
    grow: number;
  } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    palette: Palette,
    options: { reduced: boolean },
  ) {
    this.palette = palette;
    this.reduced = options.reduced;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // In the light theme, a camera's response to light that rolls off the
    // highlights (Khronos PBR Neutral), so pale metal and glass do not
    // clip; the coloured marks (pins, dots, arcs) opt out. In the dark
    // theme the picture goes through the bloom, where tone mapping would
    // apply to the whole frame and press the panel's near-black to black:
    // there it is left off, and the panel and the marks keep their colours.
    this.renderer.toneMapping = palette.dark
      ? THREE.NoToneMapping
      : THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    const studio = new THREE.PMREMGenerator(this.renderer);
    this.environment = studio.fromScene(new RoomEnvironment(), 0.04).texture;
    studio.dispose();
    this.camera = new THREE.PerspectiveCamera(T.camera.fov, T.aspect, 0.1, 80);
    this.camera.position.set(...T.camera.position);
    this.camera.lookAt(...T.camera.target);
    this.buildRoom();
    this.root.add(this.stage);
    if (palette.dark) {
      // Rendered through a target with its own multisampling, so the edges
      // stay smooth; then the bright parts bloom, then the output pass
      // applies the tone mapping and the screen's colour space.
      const target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples: 4,
      });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.root, this.camera));
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        0.38,
        0.2,
        0.88,
      );
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  private draw() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.root, this.camera);
  }

  // ── Colours and materials ───────────────────────────────────────────────

  private color(rgb: Rgb) {
    return new THREE.Color().setRGB(
      rgb[0],
      rgb[1],
      rgb[2],
      THREE.SRGBColorSpace,
    );
  }

  private tone(tone: SceneTone): THREE.Color {
    const { brand, ok, warning, danger, muted } = this.palette;
    return this.color({ brand, ok, warning, danger, muted }[tone] as Rgb);
  }

  private standard(
    rgb: Rgb,
    options: THREE.MeshStandardMaterialParameters = {},
  ) {
    return new THREE.MeshStandardMaterial({
      color: this.color(rgb),
      roughness: 0.45,
      metalness: 0.25,
      ...options,
    });
  }

  private basic(
    color: THREE.Color,
    options: THREE.MeshBasicMaterialParameters = {},
  ) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      // The app's colours, as they are: never through the film response.
      toneMapped: false,
      ...options,
    });
  }

  /** A short text drawn into the scene, on a tile or a plate. */
  private label(text: string, width: number, height: number, fill: Rgb) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = css(fill);
      context.fillRect(0, 0, width, height);
      context.fillStyle = css(this.palette.ink);
      const size = Math.round(height * 0.24);
      context.font = `500 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      let shown = text;
      while (
        shown.length > 3 &&
        context.measureText(shown).width > width * 0.86
      ) {
        shown = shown.slice(0, -1);
      }
      if (shown !== text) shown = `${shown.slice(0, -1)}…`;
      context.fillText(shown, width / 2, height / 2 + size * 0.06);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  // ── The room: everything that stays for every run ───────────────────────

  private buildRoom() {
    const p = this.palette;
    const room = this.root;
    room.background = this.color(p.bg);
    room.fog = new THREE.Fog(this.color(p.bg), 18, 32);
    const pi = Math.PI;
    room.environment = this.environment;
    room.environmentIntensity = p.dark ? 0.32 : 0.75;
    room.add(new THREE.AmbientLight(0xffffff, (p.dark ? 0.12 : 0.35) * pi));
    const key = new THREE.DirectionalLight(0xffffff, (p.dark ? 0.9 : 0.8) * pi);
    key.position.set(3, 9, 6);
    room.add(key);
    const fill = new THREE.DirectionalLight(
      0xffffff,
      (p.dark ? 0.25 : 0.35) * pi,
    );
    fill.position.set(-6, 3, 4);
    room.add(fill);
    this.fanLight = new THREE.PointLight(this.color(p.brand), 0, 7.5, 2);
    this.fanLight.position.set(T.fan + 1.3, 0, 0.4);
    room.add(this.fanLight);

    const x0 = T.fan + 0.3;
    const x1 = T.end + 0.3;
    const length = x1 - x0;
    const cx = (x0 + x1) / 2;
    // The section runs from the back wall to its open side.
    const width = T.open - T.back;
    const cz = (T.back + T.open) / 2;
    const height = T.ceiling - T.floor;

    // The floor and the back wall are solid slabs, as the wall the fan
    // comes through is: a thickness you can see, softly bevelled edges, a
    // little proud of the section. Matte: they take the light and the
    // model's soft shade, and mirror nothing (the owner chose matte).
    const { slab: thick, lip: proud } = T.slab;
    const floor = new THREE.Mesh(
      slabGeometry(length, width + proud * 2, thick, 0.16),
      this.standard(p.floor, { roughness: 0.85, metalness: 0.05 }),
    );
    // Laid flat, its top face is the floor.
    floor.rotation.x = -pi / 2;
    floor.position.set(cx, T.floor, cz);
    room.add(floor);
    const back = new THREE.Mesh(
      slabGeometry(length, height + thick + proud, thick, 0.16),
      this.standard(p.wall, { roughness: 0.82, metalness: 0.05 }),
    );
    // Stood up behind the section, its face is the back wall; it runs
    // from the bottom of the floor's slab to a little over the ceiling.
    back.position.set(cx, (T.ceiling + proud + T.floor - thick) / 2, T.back);
    room.add(back);
    // Glass: clear and faint, with only a soft sheen.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(length, width),
      this.standard(p.wall, {
        transparent: true,
        opacity: p.dark ? 0.05 : 0.16,
        roughness: 0.6,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    glass.rotation.x = pi / 2;
    glass.position.set(cx, T.ceiling, cz);
    room.add(glass);
    // The wall the fan comes through.
    // Turned to face the air, its width runs along -z: its middle is at
    // -cz in its own plane, and the fan's hole stays on the axis.
    // It reaches 0.35 past the open side (0.15 elsewhere), so the fan's
    // lit duct never shows round its edge from the camera.
    const wall = rounded(
      new THREE.Shape(),
      width + 0.5,
      height + 0.3,
      0.36,
      -(cz + 0.1),
    );
    wall.holes.push(
      new THREE.Path().absarc(0, 0, T.fanRadius - 0.02, 0, pi * 2, true),
    );
    const wallGeometry = new THREE.ExtrudeGeometry(wall, {
      depth: 0.22,
      bevelEnabled: false,
      curveSegments: 24,
    });
    wallGeometry.translate(0, 0, -0.11);
    wallGeometry.rotateY(pi / 2);
    const endWall = new THREE.Mesh(
      wallGeometry,
      this.standard(p.wall, { metalness: 0.05, roughness: 0.85 }),
    );
    endWall.position.x = x0;
    room.add(endWall);

    // The fan: its duct, lit from deep inside while it turns; the lip.
    const duct = new THREE.Mesh(
      new THREE.CylinderGeometry(T.fanRadius, T.fanRadius, 0.8, 64, 1, true),
      this.standard(p.wall, {
        side: THREE.BackSide,
        metalness: 0.6,
        roughness: 0.4,
      }),
    );
    duct.rotation.z = pi / 2;
    // Short, so it stays hidden behind the wall from the camera.
    duct.position.x = T.fan - 0.1;
    room.add(duct);
    this.ductGlow = this.basic(this.color(p.brand), { opacity: 0 });
    const deep = new THREE.Mesh(
      new THREE.CircleGeometry(T.fanRadius, 64),
      this.ductGlow,
    );
    deep.rotation.y = pi / 2;
    deep.position.x = T.fan - 0.45;
    room.add(deep);
    // A bell-mouth: the duct flares smoothly out into the wall, as a real
    // tunnel's inlet does, instead of a ring round a hole.
    const flare: THREE.Vector2[] = [new THREE.Vector2(T.fanRadius, -0.3)];
    for (let i = 0; i <= 16; i += 1) {
      const a = (i / 16) * (pi / 2);
      flare.push(
        new THREE.Vector2(
          T.fanRadius + 0.24 * (1 - Math.cos(a)),
          0.24 * Math.sin(a),
        ),
      );
    }
    const mouth = new THREE.LatheGeometry(flare, 96);
    // Its axis along the air (x), opening downstream.
    mouth.rotateZ(-pi / 2);
    const lip = new THREE.Mesh(
      mouth,
      this.standard(p.metal, { ...MATTE, side: THREE.DoubleSide }),
    );
    lip.position.x = x0 - 0.1;
    room.add(lip);

    // Wide, swept, overlapping blades round a rounded nose cone.
    const mount = new THREE.Group();
    mount.rotation.y = pi / 2;
    // Drawn for a fan of radius 1.32, then scaled to the one here.
    mount.scale.setScalar(T.fanRadius / 1.32);
    mount.position.x = T.fan - 0.1;
    room.add(mount);
    this.fan = new THREE.Group();
    mount.add(this.fan);
    const blade = this.standard(p.blade, {
      ...MATTE,
      side: THREE.DoubleSide,
    });
    const shape = bladeGeometry(0.32, 1.27);
    for (let index = 0; index < 20; index += 1) {
      const mesh = new THREE.Mesh(shape, blade);
      mesh.rotation.z = (index * pi * 2) / 20;
      this.fan.add(mesh);
    }
    // Fixed stator vanes behind the fan, straightening the air.
    const vane = this.standard(p.frame, { ...MATTE, side: THREE.DoubleSide });
    for (let index = 0; index < 13; index += 1) {
      const geometry = new THREE.BoxGeometry(0.035, 0.94, 0.16);
      geometry.translate(0, 0.8, 0);
      const mesh = new THREE.Mesh(geometry, vane);
      mesh.rotation.z = (index * pi * 2) / 13 + 0.12;
      mesh.position.z = -0.3;
      mount.add(mesh);
    }
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.33, 0.18, 32),
      this.standard(p.blade, MATTE),
    );
    hub.rotation.x = pi / 2;
    this.fan.add(hub);
    const cone = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 32, 16),
      this.standard(p.metal, MATTE),
    );
    cone.scale.set(1, 1, 1.8);
    cone.position.z = 0.06;
    this.fan.add(cone);
    // At speed the blades blur into a disc, in front of them and still.
    this.fanBlur = this.basic(this.color(p.blade), {
      opacity: 0,
      depthWrite: false,
      toneMapped: true,
    });
    const blur = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 1.26, 64),
      this.fanBlur,
    );
    blur.position.z = 0.04;
    mount.add(blur);
  }

  // ── The cast: what one input builds ─────────────────────────────────────

  private clearStage() {
    this.stage.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const material of materials) {
        (material as THREE.MeshBasicMaterial).map?.dispose();
        material.dispose();
      }
    });
    this.stage.clear();
    this.streams = [];
    this.models = [];
    this.tiles.clear();
    this.spots.clear();
    this.arcs.clear();
    this.pins.clear();
    this.effects = [];
    this.beacon = null;
    this.shields = [];
    this.judged = 0;
    this.lights = [];
    this.scan = null;
    this.jets = [];
    this.flown.clear();
    this.picks.clear();
    this.hovered = null;
  }

  private build(input: TunnelInput) {
    this.clearStage();
    const { scene } = input;
    const p = this.palette;
    const designs = scene.designs?.length ?? 0;
    const spots = modelSpots(designs);
    const scale = designs > 1 ? T.designs.scale : 1;
    spots.forEach((x, index) => {
      this.models.push(
        this.model(x, scale, designs > 1 ? null : input.subject, index === 0),
      );
    });
    if (designs <= 1) this.placeParts(scene, this.models[0]);

    // A stream per worker, straight out of the fan: there is no rake,
    // each stream leaves the fan's disc and fades in as it goes.
    const rows = rows3d(input.streams.length);
    const fade0 = spots[0] - 1.2 * scale;
    const fade1 = spots[spots.length - 1] + 1.2 * scale;
    input.streams.forEach((worker, index) => {
      const y = rows[index];
      const path = new THREE.LineCurve3(
        new THREE.Vector3(T.source, y, 0),
        new THREE.Vector3(T.end, y, 0),
      );
      const shader = (alpha: number, gain: number) =>
        new THREE.ShaderMaterial({
          uniforms: {
            color: { value: new THREE.Color() },
            alpha: { value: alpha },
            pulse: { value: -20 },
            on: { value: 0 },
            fade0: { value: fade0 },
            fade1: { value: fade1 },
            from: { value: T.source },
            to: { value: T.end },
            gain: { value: gain },
          },
          vertexShader: STREAM_VERTEX,
          fragmentShader: STREAM_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: p.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
      const core = new THREE.Mesh(
        new THREE.TubeGeometry(path, 4, 0.012, 8),
        shader(0.9, 1.6),
      );
      const glow = new THREE.Mesh(
        new THREE.TubeGeometry(path, 4, 0.05, 10),
        shader(0.16, 1),
      );
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 16),
        this.basic(this.tone("muted"), { opacity: 1 }),
      );
      dot.position.set(T.end, y, 0);
      this.stage.add(core, glow, dot);
      this.picks.set(`worker:${worker.id}`, {
        object: dot,
        radius: 16,
        small: true,
      });
      this.streams.push({
        id: worker.id,
        y,
        index,
        core,
        glow,
        dot,
        color: new THREE.Color(),
        target: new THREE.Color(),
        alpha: 0.28,
        alphaTarget: 0.28,
        running: false,
        flowing: false,
        travel: index * 1.37,
        latest: null,
      });
    });

    if (scene.crosswind) this.buildCrosswind();
    if (scene.spec) this.buildBoard(scene.spec.length);
  }

  /** The application on its turntable: three plates on a sting. */
  private model(
    x: number,
    scale: number,
    subject: string | null,
    main: boolean,
  ): Model {
    const p = this.palette;
    const group = new THREE.Group();
    group.position.x = x;
    this.stage.add(group);
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0 * scale, 1.0 * scale, 0.03, 64),
      // A machined turntable, set in the floor.
      this.standard(p.plate, { roughness: 0.38, metalness: 0.55 }),
    );
    table.position.y = T.floor + 0.02;
    group.add(table);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.0 * scale, 0.01, 8, 96),
      this.basic(this.tone("brand"), { opacity: 0.45 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = T.floor + 0.038;
    group.add(rim);
    // A soft contact shadow under the plates: smooth at any size, where a
    // shadow map's edges stepped.
    const shade = new THREE.Mesh(
      new THREE.PlaneGeometry(
        T.plate.w * scale * 1.45,
        T.plate.d * scale * 1.6,
      ),
      new THREE.MeshBasicMaterial({
        map: contactShadow(),
        color: 0x000000,
        transparent: true,
        opacity: p.dark ? 0.7 : 0.22,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = T.floor + 0.042;
    group.add(shade);
    // A faired strut from the turntable up to the model.
    const sting = new THREE.Mesh(
      strutGeometry(0.18 * Math.max(scale, 0.7), 0.045, T.floor, T.plateY.data),
      this.standard(p.metal, { metalness: 0.6, roughness: 0.35 }),
    );
    group.add(sting);

    const plates = {} as Model["plates"];
    const plateMaterials: THREE.MeshStandardMaterial[] = [];
    const edges: THREE.LineBasicMaterial[] = [];
    for (const plate of PLATES) {
      const geometry = new THREE.BoxGeometry(
        T.plate.w * scale,
        0.045,
        T.plate.d * scale,
      );
      // Acrylic: a clear coat over a satin face, the room's light on it.
      const material = new THREE.MeshPhysicalMaterial({
        color: this.color(p.plate),
        transparent: true,
        opacity: PLATE_OPACITY[plate],
        roughness: 0.28,
        metalness: 0.05,
        clearcoat: 0.8,
        clearcoatRoughness: 0.12,
      });
      const edge = new THREE.LineBasicMaterial({
        color: this.tone("brand"),
        transparent: true,
        opacity: 0.75,
      });
      const holder = new THREE.Group();
      holder.position.y = T.plateY[plate];
      const face = new THREE.Mesh(geometry, material);
      holder.add(face);
      holder.add(
        new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge),
      );
      group.add(holder);
      plates[plate] = holder;
      plateMaterials.push(material);
      edges.push(edge);
    }
    // The interface plate: the application's name and a few quiet lines.
    if (subject && main) {
      const name = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.18),
        new THREE.MeshBasicMaterial({
          map: this.label(subject, 512, 102, p.plate),
          transparent: true,
        }),
      );
      name.rotation.x = -Math.PI / 2;
      name.position.set(-0.45, 0.026, -0.56);
      plates.interface.add(name);
    }
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.3 * scale, 0.01, 0.12 * scale),
      this.basic(this.tone("brand"), { opacity: 0.4 }),
    );
    bar.position.set(0.2 * scale, 0.03, -0.38 * scale);
    plates.interface.add(bar);
    // The data plate: a fine grid of dots.
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.014 * scale, 6, 6),
          this.basic(this.tone("muted"), { opacity: 0.5 }),
        );
        dot.position.set(
          (-0.8 + i * 0.32) * scale,
          0.03,
          (-0.5 + j * 0.33) * scale,
        );
        plates.data.add(dot);
      }
    }
    return {
      group,
      plates,
      plateMaterials,
      edges,
      lift: 0,
      liftTarget: 0,
      dim: 1,
      dimTarget: 1,
    };
  }

  /** Each part as a tile on its plate, with its name on top. */
  private placeParts(scene: TunnelScene, model: Model) {
    const p = this.palette;
    const modelX = model.group.position.x;
    const spots = partPositions(scene.parts, modelX);
    for (const part of scene.parts) {
      const spot = spots.get(part.id);
      if (!spot) continue;
      const side = this.standard(p.plate, {
        roughness: 0.4,
        emissive: this.tone("brand"),
        emissiveIntensity: 0,
        transparent: true,
      });
      const top = this.standard([1, 1, 1], {
        map: this.label(part.name, 256, 176, p.tile),
        roughness: 0.55,
        emissive: this.tone("brand"),
        emissiveIntensity: 0,
        transparent: true,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(T.tile.w, 0.05, T.tile.d),
        [side, side, top, side, side, side],
      );
      mesh.position.set(spot[0] - modelX, 0.05, spot[2]);
      // A fine outline, so a tile reads on a plate of the same colour.
      mesh.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({
            color: this.tone("brand"),
            transparent: true,
            opacity: p.dark ? 0.3 : 0.45,
          }),
        ),
      );
      model.plates[part.plate].add(mesh);
      this.picks.set(`part:${part.id}`, {
        object: mesh,
        radius: 26,
        small: false,
      });
      this.tiles.set(part.id, {
        mesh,
        edges: null,
        glow: 0,
        glowTarget: 0,
        tone: "brand",
        opacity: 1,
        opacityTarget: 1,
        pins: 0,
      });
      this.spots.set(part.id, new THREE.Vector3(...spot));
    }
  }

  /** Crosswind: a nozzle in the back wall blowing the change across. */
  private buildCrosswind() {
    const p = this.palette;
    const x = T.model - 0.1;
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.14, 0.28, 24),
      this.standard(p.metal, { metalness: 0.85, roughness: 0.22 }),
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(x, 0.05, T.back + 0.15);
    this.stage.add(nozzle);
    [-0.2, 0, 0.2].forEach((dy, index) => {
      const from = new THREE.Vector3(
        x + dy * 0.3,
        0.05 + dy * 0.6,
        T.back + 0.3,
      );
      const to = new THREE.Vector3(
        x + 0.35 + dy,
        0.05 + dy * 0.4,
        T.back + 1.25,
      );
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 2, 0.01, 6),
        this.basic(this.color(p.line), { opacity: 0 }),
      );
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        this.basic(this.color(p.line), { opacity: 0 }),
      );
      this.stage.add(tube, bead);
      this.jets.push({ tube, bead, from, to, phase: index / 3 });
    });
  }

  /** Preflight: the spec on the back wall, one light per line. */
  private buildBoard(lines: number) {
    const p = this.palette;
    const columns = Math.max(1, Math.ceil(lines / 10));
    const width = 0.15 + columns * 0.5;
    const x = T.model + T.board.x - (columns - 1) * 0.25;
    const top = T.board.y + 0.58;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 1.2),
      this.standard(p.plate, { roughness: 0.6 }),
    );
    board.position.set(x, T.board.y, T.back + 0.03);
    this.stage.add(board);
    for (let index = 0; index < lines; index += 1) {
      const column = Math.floor(index / 10);
      const row = index % 10;
      const left = x - width / 2 + 0.13 + column * 0.5;
      const y = top - 0.12 - row * 0.105;
      const light = new THREE.Mesh(
        new THREE.PlaneGeometry(0.07, 0.07),
        this.basic(this.tone("muted"), { opacity: 0.3 }),
      );
      light.position.set(left, y, T.back + 0.04);
      const length = 0.3 - (index % 3) * 0.05;
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(length, 0.022),
        this.basic(this.tone("muted"), { opacity: 0.35 }),
      );
      bar.position.set(left + 0.08 + length / 2, y, T.back + 0.04);
      this.stage.add(light, bar);
      this.lights.push(light);
    }
    this.scan = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.6),
      this.basic(this.color(p.line), {
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.scan.rotation.y = Math.PI / 2;
    this.scan.position.set(T.model, 0.05, 0);
    this.scan.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(this.scan.geometry),
        new THREE.LineBasicMaterial({
          color: this.color(p.line),
          transparent: true,
          opacity: 0,
        }),
      ),
    );
    this.stage.add(this.scan);
  }

  // ── Effects ─────────────────────────────────────────────────────────────

  private effect(
    duration: number,
    step: (k: number) => void,
    done?: () => void,
  ) {
    if (this.reduced) {
      step(1);
      done?.();
      return;
    }
    this.effects.push({ start: this.clock, duration, step, done });
  }

  /** A light leaving one place for another. */
  private spark(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: THREE.Color,
    duration: number,
    done?: () => void,
  ) {
    if (this.reduced || this.effects.length > 12) {
      done?.();
      return;
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 14, 14),
      this.basic(color, { opacity: 1 }),
    );
    this.stage.add(mesh);
    this.effect(
      duration,
      (k) => mesh.position.lerpVectors(from, to, k),
      () => {
        this.stage.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        done?.();
      },
    );
  }

  /** A soft ring of light where something lands. */
  private flash(at: THREE.Vector3, color: THREE.Color) {
    if (this.reduced) return;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      this.basic(color, { opacity: 0.9, depthWrite: false }),
    );
    mesh.position.copy(at);
    this.stage.add(mesh);
    this.effect(
      0.6,
      (k) => {
        mesh.scale.setScalar(1 + k * 3.5);
        mesh.material.opacity = 0.9 * (1 - k);
      },
      () => {
        this.stage.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      },
    );
  }

  /** A line arching from one place to another, drawn out from its start. */
  private arc(
    id: string,
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: THREE.Color,
    animate: boolean,
    opacity = 0.95,
  ) {
    const middle = from.clone().add(to).multiplyScalar(0.5);
    middle.y += 0.25 + from.distanceTo(to) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(from, middle, to);
    const geometry = new THREE.TubeGeometry(curve, 48, 0.014, 6);
    const mesh = new THREE.Mesh(geometry, this.basic(color, { opacity }));
    const count = geometry.index?.count ?? 0;
    this.stage.add(mesh);
    this.arcs.set(id, { mesh, count });
    if (!animate) return;
    geometry.setDrawRange(0, 0);
    this.effect(0.7, (k) =>
      geometry.setDrawRange(0, Math.floor((k * count) / 6) * 6),
    );
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 12),
      this.basic(color, { opacity: 1 }),
    );
    this.stage.add(bead);
    this.effect(
      0.7,
      (k) => bead.position.copy(curve.getPoint(k)),
      () => {
        this.stage.remove(bead);
        bead.geometry.dispose();
        bead.material.dispose();
      },
    );
  }

  // ── Applying an input ───────────────────────────────────────────────────

  update(input: TunnelInput) {
    const { scene } = input;
    const key = [
      scene.kind,
      input.streams.map((stream) => stream.id).join(","),
      scene.parts.map((part) => `${part.id}@${part.plate}`).join(","),
      scene.designs?.length ?? 0,
      scene.spec?.length ?? 0,
      input.subject,
    ].join("|");
    let animate = !this.first && !this.reduced && !input.ended;
    if (key !== this.key) {
      this.build(input);
      this.key = key;
      animate = false;
    }
    this.input = input;
    this.applyStreams(input, animate);
    this.applyPins(input, animate);
    this.applyParts(input, animate);
    this.applyBeacon(input);
    this.applyDuel(input, animate);
    this.applySpec(input);
    this.applyDesigns(input, animate);
    // Full speed while a worker works, slower between stages, and an idle
    // turn once the run is over: the tunnel never stands dead still.
    this.fanTarget = this.reduced
      ? 0
      : input.ended
        ? IDLE_SPIN
        : input.streams.some((stream) => stream.status === "running")
          ? 10
          : 3.5;
    if (this.first) this.fanSpeed = this.fanTarget;
    this.first = false;
    this.wake();
  }

  private streamOf(id: string) {
    return this.streams.find((stream) => stream.id === id) ?? null;
  }

  private applyStreams(input: TunnelInput, animate: boolean) {
    const p = this.palette;
    input.streams.forEach((worker) => {
      const stream = this.streamOf(worker.id);
      if (!stream) return;
      const verdict = verdictOf(worker.status, input.outcome);
      const pending = worker.status === "pending";
      stream.running = !input.ended && worker.status === "running";
      stream.flowing =
        !stream.running &&
        worker.status !== "pending" &&
        worker.status !== "failed" &&
        worker.status !== "declined";
      stream.target.copy(
        verdict === "good"
          ? this.tone("ok")
          : verdict === "bad"
            ? this.tone("danger")
            : worker.danger
              ? this.tone("danger")
              : this.color(p.line),
      );
      stream.alphaTarget = pending
        ? 0.28
        : stream.running
          ? 1
          : verdict
            ? 1
            : 0.6;
      if (!animate) {
        stream.color.copy(stream.target);
        stream.alpha = stream.alphaTarget;
      }
      stream.dot.material.color.copy(
        verdict
          ? stream.target
          : stream.running
            ? stream.target
            : this.tone("muted"),
      );
      // An actor's newest result leaves the model as a spark.
      if (
        animate &&
        worker.latest &&
        worker.latest !== stream.latest &&
        input.scene.pins.length === 0
      ) {
        this.spark(
          new THREE.Vector3(T.model + 1.15, stream.y, 0),
          new THREE.Vector3(T.end, stream.y, 0),
          this.tone("brand"),
          0.9,
        );
      }
      stream.latest = worker.latest;
    });
  }

  private applyPins(input: TunnelInput, animate: boolean) {
    const model = this.models[0];
    if (!model) return;
    for (const pin of input.scene.pins) {
      if (this.pins.has(pin.uid)) continue;
      this.pins.add(pin.uid);
      const tile = pin.part ? this.tiles.get(pin.part) : undefined;
      const color = this.tone(pin.tone);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 12),
        this.basic(color, { opacity: 1 }),
      );
      if (tile) {
        const k = tile.pins;
        tile.pins += 1;
        mesh.position.set(
          ((k % 3) - 1) * 0.11,
          0.06,
          (Math.floor(k / 3) % 2 === 0 ? -0.05 : 0.07) - 0.01,
        );
        tile.mesh.add(mesh);
        this.picks.set(`finding:${pin.uid}`, {
          object: mesh,
          radius: 12,
          small: true,
        });
      } else {
        // On the plate, away from the tiles, spread by its id.
        let hash = 0;
        for (const char of pin.uid) hash = (hash * 31 + char.charCodeAt(0)) | 0;
        mesh.position.set(
          (((hash >>> 0) % 17) / 16 - 0.5) * 1.8,
          0.045,
          ((((hash >>> 5) % 13) / 12) * 2 - 1) * 0.66,
        );
        model.plates[pin.plate].add(mesh);
        this.picks.set(`finding:${pin.uid}`, {
          object: mesh,
          radius: 12,
          small: true,
        });
      }
      const stream = this.streamOf(pin.by);
      if (animate && stream) {
        this.spark(
          new THREE.Vector3(T.model + 1.15, stream.y, 0),
          new THREE.Vector3(T.end, stream.y, 0),
          color,
          0.9,
        );
      }
    }
  }

  private applyParts(input: TunnelInput, animate: boolean) {
    const { scene } = input;
    for (const [id, tile] of this.tiles) {
      const lit = scene.lit.find((item) => item.part === id);
      tile.glowTarget = lit ? lit.strength * 1.1 : 0;
      if (lit) tile.tone = lit.tone;
      const cut = scene.cut.includes(id);
      tile.opacityTarget = cut ? 0.12 : 1;
      if (cut && !tile.edges) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(tile.mesh.geometry),
          new THREE.LineDashedMaterial({
            color: this.tone("danger"),
            dashSize: 0.035,
            gapSize: 0.025,
          }),
        );
        edges.computeLineDistances();
        tile.mesh.add(edges);
        tile.edges = edges;
      }
      const color = this.tone(tile.tone);
      for (const material of tile.mesh.material) material.emissive.copy(color);
      if (!animate) {
        tile.glow = tile.glowTarget;
        tile.opacity = tile.opacityTarget;
        this.paintTile(tile);
      }
    }
    // A part the failure reaches through the interface: the plate shows it.
    const model = this.models[0];
    if (model && scene.kind === "engineout") {
      const reached = scene.lit.some(
        (item) =>
          item.tone === "danger" &&
          scene.parts.find((part) => part.id === item.part)?.plate ===
            "interface",
      );
      model.edges[0].color.copy(this.tone(reached ? "danger" : "brand"));
    }
    for (const arc of scene.arcs) {
      if (this.arcs.has(arc.id)) continue;
      const from = this.spots.get(arc.from);
      const to = this.spots.get(arc.to);
      if (!from || !to) continue;
      this.arc(arc.id, from, to, this.tone(arc.tone), animate);
    }
  }

  private paintTile(tile: Tile) {
    for (const material of tile.mesh.material) {
      material.emissiveIntensity = tile.glow;
      material.opacity = tile.opacity;
    }
  }

  private beaconSpot(part: string | null): THREE.Vector3 {
    const spot = part ? this.spots.get(part) : undefined;
    return spot
      ? spot.clone().add(new THREE.Vector3(0, 0.08, 0))
      : new THREE.Vector3(T.model, T.plateY.services + 0.18, 0);
  }

  private applyBeacon(input: TunnelInput) {
    const beacon = input.scene.beacon;
    if (!beacon) return;
    if (!this.beacon) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 16),
        this.basic(this.tone(beacon.tone), { opacity: 1 }),
      );
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 16),
        this.basic(this.tone(beacon.tone), { opacity: 0.3, depthWrite: false }),
      );
      this.stage.add(core, halo);
      this.beacon = { core, halo, settled: false };
      this.picks.set("beacon:", { object: core, radius: 16, small: true });
    }
    const at = this.beaconSpot(beacon.part);
    this.beacon.core.position.copy(at);
    this.beacon.halo.position.copy(at);
    const color = this.tone(beacon.tone);
    this.beacon.core.material.color.copy(color);
    this.beacon.halo.material.color.copy(color);
    this.beacon.settled = input.ended || beacon.tone !== "danger";
    if (this.beacon.settled || this.reduced) {
      this.beacon.halo.scale.setScalar(2);
      this.beacon.halo.material.opacity = 0.2;
    }
  }

  private applyDuel(input: TunnelInput, animate: boolean) {
    const duel = input.scene.duel;
    if (!duel) return;
    // A shield for each fix the defender has put up.
    while (this.shields.length < duel.rounds.length) {
      const index = this.shields.length;
      const geometry = new THREE.PlaneGeometry(1.9, 1.7);
      const fill = new THREE.Mesh(
        geometry,
        this.basic(this.tone("brand"), {
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      fill.rotation.y = Math.PI / 2;
      fill.position.set(T.model + T.shield - index * 0.17, 0.05, 0);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: this.tone("brand"),
          transparent: true,
          opacity: 0,
        }),
      );
      fill.add(edges);
      this.stage.add(fill);
      this.shields.push({ fill, edges, opacity: animate ? 0 : 1 });
    }
    duel.rounds.forEach((round, index) => {
      const shield = this.shields[index];
      const last = index === duel.rounds.length - 1;
      const tone: SceneTone =
        round.verdict === "through"
          ? last
            ? "danger"
            : "muted"
          : round.verdict === "held" || (duel.held === true && last)
            ? "ok"
            : duel.held === false && last
              ? "danger"
              : "brand";
      shield.edges.material.color.copy(this.tone(tone));
      shield.fill.material.color.copy(this.tone(tone));
    });
    // Each round the attacker plays, seen as it lands.
    const judged = duel.rounds.filter((round) => round.verdict).length;
    if (animate && judged > this.judged) {
      const round = duel.rounds.filter((item) => item.verdict).at(-1)!;
      const index = duel.rounds.indexOf(round);
      const attacker =
        this.streams.find(
          (stream) =>
            input.streams.find((worker) => worker.id === stream.id)?.danger,
        ) ?? this.streams.at(-1);
      if (attacker) {
        const x = T.model + T.shield - index * 0.17;
        const atShield = new THREE.Vector3(x, attacker.y, 0);
        const target = this.beaconSpot(input.scene.beacon?.part ?? null);
        this.spark(
          new THREE.Vector3(T.source, attacker.y, 0),
          atShield,
          this.tone("danger"),
          0.6,
          () => {
            if (round.verdict === "through") {
              this.flash(atShield, this.tone("danger"));
              this.spark(atShield, target, this.tone("danger"), 0.45, () =>
                this.flash(target, this.tone("danger")),
              );
            } else {
              this.flash(atShield, this.tone("ok"));
            }
          },
        );
      }
    }
    this.judged = judged;
  }

  private applySpec(input: TunnelInput) {
    const spec = input.scene.spec;
    if (!spec) return;
    const tone: Record<LineStatus, SceneTone> = {
      implemented: "ok",
      partly: "warning",
      missing: "muted",
      contradicted: "danger",
      unclear: "muted",
    };
    spec.forEach((line, index) => {
      const light = this.lights[index];
      if (!light) return;
      this.picks.set(`line:${line.id}`, {
        object: light,
        radius: 9,
        small: true,
      });
      light.material.color.copy(this.tone(tone[line.status]));
      light.material.opacity =
        line.status === "unclear" ? 0.3 : line.status === "missing" ? 0.55 : 1;
    });
  }

  private applyDesigns(input: TunnelInput, animate: boolean) {
    const designs = input.scene.designs;
    if (!designs || designs.length < 2) return;
    designs.forEach((design, index) => {
      const model = this.models[index];
      if (!model) return;
      this.picks.set(`design:${design.id}`, {
        object: model.plates.services,
        radius: 70,
        small: false,
      });
      const shown = design.state !== "pending";
      for (const plate of PLATES) model.plates[plate].visible = shown;
      const failed = design.state === "failed";
      const picked = design.picked;
      model.liftTarget = picked ? 0.16 : 0;
      model.dimTarget =
        picked === false || failed
          ? 0.25
          : design.state === "running"
            ? 0.6
            : 1;
      const tone: SceneTone = picked ? "ok" : failed ? "danger" : "brand";
      for (const edge of model.edges) edge.color.copy(this.tone(tone));
      if (design.flown && !this.flown.has(design.id)) {
        this.flown.add(design.id);
        if (animate) {
          this.flash(
            new THREE.Vector3(model.group.position.x, 0, 0),
            this.color(this.palette.line),
          );
        }
      }
      if (!animate) {
        model.lift = model.liftTarget;
        model.dim = model.dimTarget;
        this.paintModel(model);
      }
    });
    for (const critique of input.scene.critiques) {
      const id = `critique:${critique.from}:${critique.to}`;
      if (this.arcs.has(id)) continue;
      const from = designs.findIndex((design) => design.id === critique.from);
      const to = designs.findIndex((design) => design.id === critique.to);
      if (from < 0 || to < 0 || !this.models[from] || !this.models[to])
        continue;
      const top = (index: number) =>
        new THREE.Vector3(
          this.models[index].group.position.x,
          T.plateY.interface * T.designs.scale + 0.1,
          from < to ? -0.15 : 0.15,
        );
      this.arc(
        id,
        top(from),
        top(to),
        this.color(this.palette.line),
        animate,
        0.45,
      );
    }
  }

  private paintModel(model: Model) {
    model.group.position.y = model.lift;
    model.plateMaterials.forEach((material, index) => {
      material.opacity = PLATE_OPACITY[PLATES[index]] * model.dim;
    });
    for (const edge of model.edges) edge.opacity = 0.75 * model.dim;
  }

  // ── Time ────────────────────────────────────────────────────────────────

  private wake() {
    if (this.frameId || !this.visible) return;
    this.frameId = requestAnimationFrame(this.frame);
  }

  private frame = (ms: number) => {
    this.frameId = 0;
    // Idle (nothing at work, nothing landing), the quiet motion needs no
    // more than about 30 frames a second.
    if (this.idle && this.last && ms - this.last < 32) {
      this.wake();
      return;
    }
    const dt = this.last ? Math.min(0.05, (ms - this.last) / 1000) : 0;
    this.last = ms;
    this.clock = ms / 1000;
    const moving = this.step(dt);
    this.draw();
    if (moving && this.visible) this.wake();
    else this.last = 0;
  };

  /** Moves everything on by `dt` seconds; true while anything still moves. */
  private step(dt: number): boolean {
    const p = this.palette;
    const input = this.input;
    let moving = false;

    this.fanSpeed = approach(this.fanSpeed, this.fanTarget, dt, 1.2);
    this.fan.rotation.z += this.fanSpeed * dt;
    const spin = Math.min(1, this.fanSpeed / 10);
    this.fanLight.intensity =
      (p.dark ? 1.0 : 0.8) * Math.PI * 2.2 * (0.25 + 0.75 * spin);
    // The duct's light breathes, gently, while the fan idles.
    const breath = this.reduced ? 0 : 0.18 * Math.sin(this.clock * 1.3);
    this.ductGlow.opacity =
      (p.dark ? 0.4 : 0.18) * (0.3 + 0.7 * spin) * (1 + breath * (1 - spin));
    this.fanBlur.opacity = 0.32 * Math.max(0, (this.fanSpeed - 4) / 6);
    if (this.fanSpeed > 0.01 || this.fanTarget > 0) moving = true;

    for (const stream of this.streams) {
      const before = stream.color.clone();
      stream.color.lerp(stream.target, Math.min(1, dt * 4));
      if (
        before.equals(stream.color) === false &&
        !stream.color.equals(stream.target)
      ) {
        moving = true;
      }
      stream.alpha = approach(stream.alpha, stream.alphaTarget, dt, 4);
      if (stream.alpha !== stream.alphaTarget) moving = true;
      const span = T.end - T.source + 1.4;
      for (const [mesh, alpha] of [
        [stream.core, 0.9],
        [stream.glow, 0.16],
      ] as const) {
        const u = mesh.material.uniforms;
        (u.color.value as THREE.Color).copy(stream.color);
        u.alpha.value = alpha * stream.alpha;
        u.on.value = this.reduced
          ? 0
          : stream.running
            ? 1
            : stream.flowing
              ? 0.38
              : 0;
        u.pulse.value = T.source - 0.3 + (stream.travel % span);
      }
      // A worker at work sends a bright light down its stream; once done,
      // the air keeps flowing: a soft light drifts down it, slower.
      if (!this.reduced && (stream.running || stream.flowing)) {
        stream.travel += dt * (stream.running ? 2.6 : 1.1);
        moving = true;
      }
    }

    for (const tile of this.tiles.values()) {
      tile.glow = approach(tile.glow, tile.glowTarget, dt, 3);
      tile.opacity = approach(tile.opacity, tile.opacityTarget, dt, 3);
      if (
        tile.glow !== tile.glowTarget ||
        tile.opacity !== tile.opacityTarget
      ) {
        moving = true;
      }
      this.paintTile(tile);
    }

    for (const model of this.models) {
      model.lift = approach(model.lift, model.liftTarget, dt, 3);
      model.dim = approach(model.dim, model.dimTarget, dt, 3);
      if (model.lift !== model.liftTarget || model.dim !== model.dimTarget) {
        moving = true;
      }
      this.paintModel(model);
    }

    for (const shield of this.shields) {
      shield.opacity = approach(shield.opacity, 1, dt, 3);
      if (shield.opacity !== 1) moving = true;
      shield.fill.material.opacity = 0.1 * shield.opacity;
      shield.edges.material.opacity = 0.9 * shield.opacity;
    }

    if (this.beacon && !this.beacon.settled && !this.reduced) {
      const q = (this.clock * 1.3) % 1;
      this.beacon.halo.scale.setScalar(1 + q * 2.6);
      this.beacon.halo.material.opacity = 0.4 * (1 - q);
      moving = true;
    }

    const working =
      !!input &&
      !input.ended &&
      input.streams.some((s) => s.status === "running");
    if (this.scan) {
      const on = working && !this.reduced;
      this.scan.material.opacity = on ? 0.06 : 0;
      (
        this.scan.children[0] as THREE.LineSegments<
          THREE.EdgesGeometry,
          THREE.LineBasicMaterial
        >
      ).material.opacity = on ? 0.8 : 0;
      this.scan.position.x = T.model + Math.sin(this.clock * 1.3) * 1.0;
      if (on) moving = true;
    }
    for (const jet of this.jets) {
      const on = !!input && !input.ended;
      jet.tube.material.opacity = on ? 0.6 : 0.15;
      const k = (this.clock * 1.1 + jet.phase) % 1;
      jet.bead.position.lerpVectors(jet.from, jet.to, k);
      jet.bead.material.opacity = on && !this.reduced ? 1 - k : 0;
      if (on && !this.reduced) moving = true;
    }

    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      const k = Math.min(
        1,
        Math.max(0, (this.clock - effect.start) / effect.duration),
      );
      effect.step(k);
      if (k >= 1) {
        this.effects.splice(index, 1);
        effect.done?.();
      }
    }
    if (this.effects.length > 0) moving = true;
    this.idle =
      this.effects.length === 0 &&
      !this.streams.some((stream) => stream.running);
    return moving;
  }

  // ── The page ────────────────────────────────────────────────────────────

  /**
   * The thing under the pointer, at (x, y) in a drawing `width` by
   * `height` pixels: the nearest ball within its reach, else the nearest
   * large thing. Its key, and where it is in the drawing as fractions, for
   * a card to point at.
   */
  pick(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { key: string; x: number; y: number } | null {
    const at = new THREE.Vector3();
    let best: { key: string; x: number; y: number; d: number } | null = null;
    let bestSmall = false;
    for (const [key, item] of this.picks) {
      if (!item.object.visible || !item.object.parent?.visible) continue;
      item.object.getWorldPosition(at).project(this.camera);
      const sx = ((at.x + 1) / 2) * width;
      const sy = ((1 - at.y) / 2) * height;
      const d = Math.hypot(sx - x, sy - y);
      if (d > item.radius) continue;
      // A ball always wins over a tile or a design.
      if (bestSmall && !item.small) continue;
      if (!best || (item.small && !bestSmall) || d < best.d) {
        best = { key, x: sx / width, y: sy / height, d };
        bestSmall = item.small;
      }
    }
    return best ? { key: best.key, x: best.x, y: best.y } : null;
  }

  /** Grows the thing the pointer is on, and lets the last one go. */
  highlight(key: string | null) {
    if (this.hovered?.key === key) return;
    if (this.hovered) {
      this.hovered.object.scale.divideScalar(this.hovered.grow);
      this.hovered = null;
    }
    const item = key ? this.picks.get(key) : undefined;
    if (key && item) {
      const grow = item.small ? 1.8 : 1.08;
      item.object.scale.multiplyScalar(grow);
      this.hovered = { key, object: item.object, grow };
    }
    this.wake();
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible) this.wake();
  }

  dispose() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.clearStage();
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const material of materials) material.dispose();
    });
    this.composer?.dispose();
    this.environment?.dispose();
    this.renderer.dispose();
  }
}
