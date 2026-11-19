import { SEVERITY_LABEL } from "@/lib/labels";
import type { Crew } from "@/lib/viz/crew";
import { STATUS_LABEL } from "@/lib/viz/preflight";
import type { AgentStatus } from "@/server/engine/schema";

import type { PlateId, SceneTone, TunnelScene } from "./tunnel-scene";

/*
 * What a card says about a thing in the 3D wind tunnel: a finding's pin, a
 * worker's dot, the beacon, a line of the spec, a part's tile, a design.
 * The drawing finds what is under the pointer (a key, `kind:id`); this
 * turns it into words, from the same scene and crew the drawing shows.
 * Pure; nothing here is made up.
 */

export type TipKind =
  "finding" | "worker" | "beacon" | "line" | "part" | "design";

export interface Tip {
  /** A short line over the title: the severity, the state, the plate. */
  eyebrow: string;
  title: string;
  detail: string | null;
  /** A file and line, or a count, in mono. */
  mono: string | null;
  tone: SceneTone;
}

export const tipKey = (kind: TipKind, id = "") => `${kind}:${id}`;

const PLATE_LABEL: Record<PlateId, string> = {
  interface: "Interface",
  services: "Services",
  data: "Data",
};

const STATUS_WORD: Record<AgentStatus, string> = {
  pending: "Waiting",
  running: "At work",
  done: "Done",
  declined: "Declined",
  failed: "Failed",
};

const LINE_TONE = {
  implemented: "ok",
  partly: "warning",
  missing: "muted",
  contradicted: "danger",
  unclear: "muted",
} as const;

const plural = (count: number, one: string) =>
  `${count} ${count === 1 ? one : `${one}s`}`;

/** Why a part is lit, in the words of the run's kind. */
function litReason(
  scene: TunnelScene,
  lit: TunnelScene["lit"][number],
): string | null {
  switch (scene.kind) {
    case "audit":
      return lit.tone === "danger" ? "In an attack chain" : null;
    case "crosswind":
      return lit.strength >= 0.9
        ? "The change makes or alters it"
        : "The change reaches it";
    case "engineout":
      return lit.tone === "ok"
        ? "It holds"
        : lit.tone === "danger"
          ? "The failure breaks it"
          : "The failure slows it or gets it wrong";
    case "blackbox":
      return lit.tone === "danger"
        ? "Where the request breaks"
        : "On the failing request's way";
    case "preflight":
      return lit.tone === "danger"
        ? "Its code contradicts a line of the spec"
        : "Its code meets a line of the spec only in part";
    default:
      return null;
  }
}

export function tipOf(key: string, scene: TunnelScene, crew: Crew): Tip | null {
  const split = key.indexOf(":");
  const kind = key.slice(0, split) as TipKind;
  const id = key.slice(split + 1);
  const nameOf = (worker: string) =>
    crew.members.find((member) => member.id === worker)?.name ?? worker;

  if (kind === "finding") {
    const pin = scene.pins.find((item) => item.uid === id);
    if (!pin) return null;
    return {
      eyebrow: `${SEVERITY_LABEL[pin.severity]} · ${nameOf(pin.by)}`,
      title: pin.title,
      detail: null,
      mono: pin.at,
      tone: pin.tone,
    };
  }

  if (kind === "worker") {
    const member = crew.members.find((item) => item.id === id);
    if (!member) return null;
    const working = member.status === "running" && !crew.ended;
    return {
      eyebrow: working ? "At work" : STATUS_WORD[member.status],
      title: member.name,
      detail: working
        ? member.doing
        : member.status === "pending"
          ? member.role
          : member.note,
      mono:
        member.findings === null ? null : plural(member.findings, "finding"),
      tone:
        member.status === "failed" || member.status === "declined"
          ? "danger"
          : member.status === "done"
            ? "ok"
            : working
              ? "brand"
              : "muted",
    };
  }

  if (kind === "beacon") {
    const beacon = scene.beacon;
    if (!beacon) return null;
    const part = scene.parts.find((item) => item.id === beacon.part)?.name;
    const last = scene.duel?.rounds.at(-1);
    const rounds = scene.duel?.rounds.length ?? 0;
    const duelLine = last
      ? last.verdict === "through"
        ? `Round ${last.n}: the attacker got through`
        : last.verdict === "held"
          ? `Round ${last.n}: the attacker found no way through`
          : `Round ${last.n}`
      : null;
    if (scene.kind === "dogfight") {
      return {
        eyebrow:
          scene.duel?.held === true
            ? `Held in round ${rounds}`
            : scene.duel?.held === false
              ? "Not held"
              : "Under attack",
        title: beacon.label,
        detail: duelLine,
        mono: part ?? null,
        tone: beacon.tone,
      };
    }
    return {
      eyebrow: beacon.tone === "ok" ? "Fixed" : "Failing here",
      title: beacon.label,
      detail: duelLine,
      mono: part ?? null,
      tone: beacon.tone,
    };
  }

  if (kind === "line") {
    const line = scene.spec?.find((item) => item.id === id);
    if (!line) return null;
    return {
      eyebrow: STATUS_LABEL[line.status],
      title: line.text,
      detail: line.status === "unclear" ? null : line.note || null,
      mono: null,
      tone: LINE_TONE[line.status],
    };
  }

  if (kind === "part") {
    const part = scene.parts.find((item) => item.id === id);
    if (!part) return null;
    const findings = scene.pins.filter((pin) => pin.part === id).length;
    const lit = scene.lit.find((item) => item.part === id);
    const reasons = [
      scene.cut.includes(id) ? "Cut: the part this run takes away" : null,
      lit ? litReason(scene, lit) : null,
    ].filter((reason): reason is string => Boolean(reason));
    return {
      eyebrow: PLATE_LABEL[part.plate],
      title: part.name,
      detail: reasons.join(". ") || null,
      mono: findings > 0 ? plural(findings, "finding") : null,
      tone: scene.cut.includes(id) ? "danger" : (lit?.tone ?? "muted"),
    };
  }

  if (kind === "design") {
    const design = scene.designs?.find((item) => item.id === id);
    if (!design) return null;
    return {
      eyebrow: design.picked
        ? "Picked by the judge"
        : design.state === "running"
          ? "Drafting"
          : design.state === "failed"
            ? "No blueprint"
            : design.state === "pending"
              ? "Waiting"
              : "Design",
      title: `${design.name}'s design`,
      detail: design.flown ? "Flown in the tunnel" : null,
      mono: null,
      tone: design.picked
        ? "ok"
        : design.state === "failed"
          ? "danger"
          : "brand",
    };
  }

  return null;
}
