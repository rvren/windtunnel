import { componentOf } from "@/server/engine/architecture";
import type {
  Architecture,
  CodeLocation,
  LineStatus,
  RunKind,
  RunRecord,
  Severity,
} from "@/server/engine/schema";
import type { Feed } from "@/lib/run-feed";

import { chainFlight } from "./chains";
import { TUNNEL_3D, partSpots, type Vec3 } from "./tunnel";
import type { HopTone } from "./flight-path";
import { outageFlight } from "./outage";
import { rippleFlight } from "./ripple";

/*
 * What the 3D wind tunnel draws for a run, and nothing it makes up. The
 * application on the turntable is three plates: its interface (the
 * frontends), its services, and its data (databases, queues and outside
 * systems). Each kind then adds what is its own:
 *
 *   Tunnel Run  a pin where each finding is, and Flutter's chains as arcs
 *   Crosswind   the parts the change touches, lit, and its ripple
 *   Fly-off     three designs, flown in turn, and the one the judge picks
 *   Black Box   a beacon on the failing part, the request's route, the fix
 *   Engine Out  the part cut, and the failure hopping from it
 *   Dogfight    the target part, and each round of the duel
 *   Preflight   the spec, one light per line, and the parts it cites
 *
 * Built from the saved run and the live feed, so it grows as the events
 * come in. Pure; drawn by components/run/crew/tunnel-3d.
 */

export type PlateId = "interface" | "services" | "data";
export type SceneTone = "brand" | "ok" | "warning" | "danger" | "muted";

export interface ScenePart {
  id: string;
  name: string;
  plate: PlateId;
}

export interface ScenePin {
  uid: string;
  /** The worker that filed it, to start its spark on that stream. */
  by: string;
  part: string | null;
  plate: PlateId;
  tone: SceneTone;
}

export interface SceneArc {
  id: string;
  from: string;
  to: string;
  tone: SceneTone;
}

export interface SceneDuel {
  rounds: { n: number; verdict: "through" | "held" | null }[];
  max: number;
  /** Null until it ends. */
  held: boolean | null;
}

export interface SceneDesign {
  id: string;
  name: string;
  state: "pending" | "running" | "done" | "failed";
  flown: boolean;
  /** Null until the judge rules. */
  picked: boolean | null;
}

export interface TunnelScene {
  kind: RunKind;
  /** The model's parts, at most PLATE_MAX on each plate. */
  parts: ScenePart[];
  pins: ScenePin[];
  /** Arcs between parts, in the order they happened. */
  arcs: SceneArc[];
  /** Parts lit, strongest first wins. */
  lit: { part: string; tone: SceneTone; strength: number }[];
  /** Parts cut off: Engine Out's. */
  cut: string[];
  /** A mark on one part: Black Box's failure, Dogfight's target. */
  beacon: { part: string | null; tone: SceneTone; label: string } | null;
  duel: SceneDuel | null;
  /** Preflight's lines in order. */
  spec: { id: string; status: LineStatus }[] | null;
  /** Fly-off's three designs, each on its own turntable. */
  designs: SceneDesign[] | null;
  /** Fly-off: who critiqued whose design, as arcs between designs. */
  critiques: { from: string; to: string }[];
  /** Crosswind: the change blows in from the side. */
  crosswind: boolean;
}

/** How many parts fit on one plate. */
export const PLATE_MAX = 8;
/** How many pins the model carries at most. */
export const PIN_MAX = 40;

const PLATE_OF: Record<Architecture["components"][number]["kind"], PlateId> = {
  frontend: "interface",
  service: "services",
  library: "services",
  other: "services",
  database: "data",
  queue: "data",
  external: "data",
};

const SEVERITY_TONE: Record<Severity, SceneTone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "muted",
};

const HOP_TONE: Record<HopTone, SceneTone> = {
  danger: "danger",
  warning: "warning",
  ok: "ok",
  accent: "brand",
};

const LINE_TONE: Partial<Record<LineStatus, SceneTone>> = {
  contradicted: "danger",
  partly: "warning",
};

/** The map the run's parts come from, if it has one. */
function mapOf(run: RunRecord, feed: Feed): Architecture | null {
  if (run.kind === "crosswind" && run.impact?.after) return run.impact.after;
  return run.source?.architecture ?? feed.architecture ?? null;
}

/** The model's parts: the map's, or the workspaces when there is no map. */
export function partsOf(
  architecture: Architecture | null,
  workspaces: string[],
): ScenePart[] {
  const count: Record<PlateId, number> = {
    interface: 0,
    services: 0,
    data: 0,
  };
  const take = (part: ScenePart) => {
    if (count[part.plate] >= PLATE_MAX) return [];
    count[part.plate] += 1;
    return [part];
  };
  if (architecture && architecture.components.length > 0) {
    return architecture.components.flatMap((item) =>
      take({ id: item.id, name: item.name, plate: PLATE_OF[item.kind] }),
    );
  }
  return workspaces.flatMap((name) =>
    take({ id: name, name, plate: "services" }),
  );
}

/**
 * Where each part's tile sits in the scene, on its plate of the model at
 * `modelX`: the same place for the 3D drawing and the labels over it.
 */
export function partPositions(
  parts: ScenePart[],
  modelX: number = TUNNEL_3D.model,
): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const plate of ["interface", "services", "data"] as const) {
    const onPlate = parts.filter((part) => part.plate === plate);
    const spots = partSpots(onPlate.length);
    onPlate.forEach((part, index) => {
      const [x, z] = spots[index];
      out.set(part.id, [modelX + x, TUNNEL_3D.plateY[plate] + 0.1, z]);
    });
  }
  return out;
}

/** The part a file is in: by the map, else by its workspace. */
function partOfPath(
  path: string | null | undefined,
  architecture: Architecture | null,
  parts: ScenePart[],
): string | null {
  if (!path) return null;
  const known = new Set(parts.map((part) => part.id));
  const byMap = architecture
    ? componentOf(path, architecture ?? undefined)
    : null;
  if (byMap && known.has(byMap)) return byMap;
  const workspace = path.split("/")[0];
  return known.has(workspace) ? workspace : null;
}

const plateOf = (part: string | null, parts: ScenePart[]): PlateId =>
  parts.find((item) => item.id === part)?.plate ?? "services";

/** Lights a part, keeping the strongest light it was given. */
function light(
  lit: TunnelScene["lit"],
  part: string,
  tone: SceneTone,
  strength: number,
) {
  const at = lit.findIndex((item) => item.part === part);
  if (at < 0) lit.push({ part, tone, strength });
  else if (lit[at].strength < strength) lit[at] = { part, tone, strength };
}

/** Arcs and lights from a flight plan's hops. A stop lights its part. */
function fly(
  scene: TunnelScene,
  hops: { id: string; from: string; to: string; tone: HopTone }[],
  prefix: string,
  strength = 0.9,
) {
  const known = new Set(scene.parts.map((part) => part.id));
  for (const hop of hops) {
    const tone = HOP_TONE[hop.tone];
    if (known.has(hop.to)) light(scene.lit, hop.to, tone, strength);
    if (hop.from !== hop.to && known.has(hop.from) && known.has(hop.to)) {
      scene.arcs.push({
        id: `${prefix}${hop.id}`,
        from: hop.from,
        to: hop.to,
        tone,
      });
    }
  }
}

function duelOf(run: RunRecord): SceneDuel | null {
  const fight = run.dogfight;
  if (!fight) return null;
  return {
    rounds: fight.rounds.map((round) => ({
      n: round.n,
      verdict: round.attack?.verdict ?? null,
    })),
    max: fight.maxRounds,
    held: fight.held,
  };
}

export function tunnelScene(run: RunRecord, feed: Feed): TunnelScene {
  const kind = run.kind ?? "audit";
  const architecture = mapOf(run, feed);
  const parts = partsOf(
    architecture,
    run.workspaces?.length
      ? run.workspaces
      : feed.workspaces.map((item) => item.name),
  );
  const scene: TunnelScene = {
    kind,
    parts,
    pins: [],
    arcs: [],
    lit: [],
    cut: [],
    beacon: null,
    duel: null,
    spec: null,
    designs: null,
    critiques: [],
    crosswind: kind === "crosswind",
  };
  const at = (location: CodeLocation | null | undefined) =>
    partOfPath(location?.path, architecture, parts);

  if (kind === "audit" || kind === "crosswind") {
    // Every finding as it was filed, oldest first.
    scene.pins = [...feed.live]
      .reverse()
      .slice(0, PIN_MAX)
      .map((finding) => {
        const part = partOfPath(finding.path, architecture, parts);
        return {
          uid: finding.uid,
          by: finding.agentId,
          part,
          plate: part ? plateOf(part, parts) : "services",
          tone: SEVERITY_TONE[finding.severity],
        };
      });
  }

  if (kind === "audit") {
    for (const chain of run.chains ?? []) {
      fly(scene, chainFlight(chain, run).hops, `${chain.id}:`, 0.6);
    }
  }

  if (kind === "crosswind" && run.impact) {
    const text =
      run.change?.input.kind === "text"
        ? run.change.input.text
        : (run.change?.title ?? "");
    const ripple = rippleFlight(run.impact, text);
    if (ripple) {
      // The parts the change makes or alters glow brightest; what it
      // reaches, less.
      for (const hop of ripple.hops) {
        const source = hop.from === hop.to;
        if (scene.parts.some((part) => part.id === hop.to)) {
          light(scene.lit, hop.to, "brand", source ? 1 : 0.45);
        }
        if (!source) {
          scene.arcs.push({
            id: `ripple:${hop.id}`,
            from: hop.from,
            to: hop.to,
            tone: "brand",
          });
        }
      }
    }
  }

  if (kind === "engineout" && run.outage) {
    const plan = outageFlight(run.outage);
    scene.cut = plan.cut.filter((id) => parts.some((part) => part.id === id));
    fly(scene, plan.hops, "hop:");
  }

  if (kind === "dogfight" && run.dogfight) {
    scene.duel = duelOf(run);
    const held = run.dogfight.held;
    const last = scene.duel?.rounds.at(-1)?.verdict ?? null;
    scene.beacon = {
      part: at(run.dogfight.target.location),
      tone:
        held === true
          ? "ok"
          : held === false || last === "through"
            ? "danger"
            : "brand",
      label: run.dogfight.target.title,
    };
  }

  if (kind === "blackbox") {
    const route = run.triage?.route ?? [];
    const failing =
      at(route.at(-1)) ?? at(run.triage?.suspects[0]) ?? at(route[0]);
    // The request's way through the parts, a stop where it changes part:
    // by the map when there is one, else by each file's workspace.
    const stops = route
      .map((step) => at(step))
      .filter((part): part is string => part !== null)
      .filter((part, index, all) => index === 0 || all[index - 1] !== part);
    stops.forEach((part, index) => {
      const last = index === stops.length - 1;
      light(scene.lit, part, last ? "danger" : "warning", 0.5);
      if (index > 0) {
        scene.arcs.push({
          id: `route:${index}`,
          from: stops[index - 1],
          to: part,
          tone: last ? "danger" : "warning",
        });
      }
    });
    const fixed = run.remediations?.["incident-1"]?.status === "made";
    scene.duel = duelOf(run);
    scene.beacon = {
      part: failing,
      tone: scene.duel?.held === false ? "danger" : fixed ? "ok" : "danger",
      label: run.triage?.title ?? run.incident?.split("\n")[0] ?? "",
    };
  }

  if (kind === "preflight" && run.preflight) {
    scene.spec = run.preflight.lines.map(({ id, status }) => ({ id, status }));
    for (const line of run.preflight.lines) {
      const tone = LINE_TONE[line.status];
      const part = at(line.locations[0]);
      if (tone && part) light(scene.lit, part, tone, 0.8);
    }
  }

  if (kind === "flyoff" && run.flyoff) {
    const winner = run.flyoff.verdict?.winnerId ?? null;
    scene.designs = run.flyoff.blueprints.map((item) => ({
      id: item.id,
      name: item.proposer,
      state: item.status,
      flown: Boolean(run.flyoff?.flights?.[item.id]),
      picked: winner === null ? null : winner === item.id,
    }));
    scene.critiques = run.flyoff.critiques.map((item) => ({
      from: item.from,
      to: item.blueprintId,
    }));
  }

  return scene;
}
