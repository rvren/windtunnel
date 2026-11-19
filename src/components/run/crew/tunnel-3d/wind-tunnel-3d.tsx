"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import type { Crew } from "@/lib/viz/crew";
import { TUNNEL_3D, modelSpots, project, rows3d } from "@/lib/viz/tunnel";
import {
  partPositions,
  type SceneTone,
  type TunnelScene,
} from "@/lib/viz/tunnel-scene";

import { clip, CrewList } from "../parts";
import { readPalette } from "./colors";
import type { Tunnel3D, TunnelInput } from "./scene";

/*
 * The wind tunnel in 3D (the scene is ./scene.ts, loaded only here). Over
 * the drawing, as HTML: each worker's name at the end of its stream, what
 * it came to once the run is over, its count at the right; and the few
 * words a kind adds (the part cut, the round, the spec, each design). They
 * are placed by the same projection as the camera (`project` in
 * src/lib/viz/tunnel.ts), so they show at once, before three.js has
 * loaded, and stay sharp at any size.
 */

const T = TUNNEL_3D;

const TONE_TEXT: Record<SceneTone, string> = {
  brand: "text-link",
  ok: "text-ok",
  warning: "text-sev-high",
  danger: "text-sev-critical",
  muted: "text-muted-foreground",
};

/** A worker as the drawing's streams take it. */
function streamsOf(crew: Crew, scene: TunnelScene): TunnelInput["streams"] {
  const duel = scene.kind === "dogfight" || scene.kind === "blackbox";
  return crew.members.map((member) => ({
    id: member.id,
    status: member.status,
    danger: duel && member.id === "attacker",
    latest: member.latest?.uid ?? null,
  }));
}

/** The words a kind adds over the drawing, each at the place it names. */
function tagsOf(
  scene: TunnelScene,
  ended: boolean,
): {
  id: string;
  text: string;
  at: [number, number, number];
  tone: SceneTone;
}[] {
  const tags: ReturnType<typeof tagsOf> = [];
  const spots = partPositions(scene.parts);
  for (const id of scene.cut) {
    const spot = spots.get(id);
    if (spot) {
      tags.push({
        id: `cut:${id}`,
        text: "cut",
        at: [spot[0], spot[1] + 0.28, spot[2]],
        tone: "danger",
      });
    }
  }
  if (scene.duel && scene.duel.rounds.length > 0) {
    const { rounds, held } = scene.duel;
    tags.push({
      id: "duel",
      text:
        held === true
          ? `Held in round ${rounds.length}`
          : held === false || (ended && held === null)
            ? `Not held after ${rounds.length === 1 ? "1 round" : `${rounds.length} rounds`}`
            : `Round ${rounds.length}`,
      at: [T.model + T.shield, 1.05, 0],
      tone: held === true ? "ok" : held === false ? "danger" : "muted",
    });
  }
  if (scene.spec) {
    const columns = Math.max(1, Math.ceil(scene.spec.length / 10));
    tags.push({
      id: "spec",
      text: "The spec",
      at: [
        T.model + T.board.x - (columns - 1) * 0.25,
        T.board.y + 0.66,
        T.back + 0.05,
      ],
      tone: "muted",
    });
  }
  if (scene.designs && scene.designs.length > 1) {
    const xs = modelSpots(scene.designs.length);
    scene.designs.forEach((design, index) => {
      tags.push({
        id: `design:${design.id}`,
        text: design.picked ? `${design.name} · picked` : design.name,
        at: [xs[index], T.plateY.interface * T.designs.scale + 0.42, 0],
        tone: design.picked
          ? "ok"
          : design.picked === false
            ? "muted"
            : "muted",
      });
    });
  }
  if (scene.crosswind) {
    tags.push({
      id: "change",
      text: "The change",
      at: [T.model - 0.1, 0.42, T.back + 0.15],
      tone: "muted",
    });
  }
  return tags;
}

const pct = (value: number) => `${(value * 100).toFixed(3)}%`;

export function WindTunnel3D({
  crew,
  scene,
  subject,
  onFail,
}: {
  crew: Crew;
  scene: TunnelScene;
  subject: string;
  /** Called when WebGL cannot draw here: the 2D tunnel takes over. */
  onFail: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Tunnel3D | null>(null);
  const [ready, setReady] = useState(false);
  const { resolvedTheme } = useTheme();
  const reduced = Boolean(useReducedMotion());
  const dark = resolvedTheme === "dark";

  const input = useMemo<TunnelInput>(
    () => ({
      streams: streamsOf(crew, scene),
      scene,
      subject,
      ended: crew.ended,
      outcome: crew.outcome,
    }),
    [crew, scene, subject],
  );
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
    engine.current?.update(input);
  }, [input]);

  // The scene: made when the drawing mounts, and again for a new theme.
  useEffect(() => {
    let gone = false;
    let made: Tunnel3D | null = null;
    let resize: ResizeObserver | null = null;
    let seen: IntersectionObserver | null = null;
    import("./scene")
      .then(({ Tunnel3D }) => {
        if (gone || !box.current || !canvas.current) return;
        made = new Tunnel3D(canvas.current, readPalette(box.current, dark), {
          reduced,
        });
        engine.current = made;
        made.update(latest.current);
        const element = canvas.current;
        const fit = () =>
          made?.resize(element.clientWidth, element.clientHeight);
        fit();
        resize = new ResizeObserver(fit);
        resize.observe(element);
        seen = new IntersectionObserver(([entry]) =>
          made?.setVisible(entry.isIntersecting),
        );
        seen.observe(element);
        setReady(true);
      })
      .catch(() => {
        if (!gone) onFail();
      });
    return () => {
      gone = true;
      resize?.disconnect();
      seen?.disconnect();
      made?.dispose();
      if (engine.current === made) engine.current = null;
    };
  }, [dark, reduced, onFail]);

  const rows = rows3d(crew.members.length);
  const tags = tagsOf(scene, crew.ended);
  return (
    <div
      ref={box}
      className={cn(
        "@container",
        // The tunnel's room and metal: pale in the light theme, dark in the
        // dark one. The rest are the app's own tokens.
        "[--wt-bg:var(--card)] [--wt-ink:var(--foreground)]",
        "[--wt-floor:#e4e4ee] dark:[--wt-floor:#111118]",
        "[--wt-wall:#e2e2ec] dark:[--wt-wall:#14141c]",
        "[--wt-frame:#cfcfdc] dark:[--wt-frame:#5a5a70]",
        "[--wt-metal:#ffffff] dark:[--wt-metal:#c8c8d8]",
        "[--wt-blade:#dcdce8] dark:[--wt-blade:#9a9ab0]",
        "[--wt-plate:#ffffff] dark:[--wt-plate:#1b1b27]",
        "[--wt-tile:#f1effa] dark:[--wt-tile:#262638]",
        "[--wt-line:var(--brand)] dark:[--wt-line:#c9c2ff]",
      )}
      data-testid="wind-tunnel-3d"
      data-ready={ready}
    >
      <div
        className="relative w-full"
        style={{ aspectRatio: `${T.aspect}` }}
        role="img"
        aria-label={crew.sentence}
      >
        <canvas
          ref={canvas}
          className={cn("absolute inset-0 size-full", !ready && "invisible")}
          aria-hidden="true"
        />
        <div aria-hidden="true" className="absolute inset-0 @max-lg:hidden">
          {crew.members.map((member, index) => {
            const at = project([T.end + 0.3, rows[index], 0]);
            const pending = member.status === "pending";
            const note = crew.ended ? member.note : null;
            return (
              <div key={member.id}>
                <div
                  className="absolute -translate-y-1/2 whitespace-nowrap"
                  style={{ left: pct(at.x), top: pct(at.y) }}
                  data-testid="tunnel-worker"
                >
                  <p
                    className={cn(
                      "text-[clamp(0.75rem,1.35cqw,0.9375rem)] leading-tight",
                      pending ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {member.name}
                  </p>
                  {note ? (
                    <p
                      className={cn(
                        "text-[clamp(0.625rem,1cqw,0.6875rem)] text-muted-foreground",
                        member.status === "failed" && "text-sev-critical",
                      )}
                    >
                      {clip(note, member.findings === null ? 32 : 24)}
                    </p>
                  ) : null}
                </div>
                {member.findings !== null ? (
                  <p
                    className={cn(
                      "absolute right-[3%] -translate-y-1/2 text-[clamp(1rem,2.2cqw,1.5rem)] font-light tabular-nums",
                      member.findings > 0
                        ? "text-foreground"
                        : "text-muted-foreground/40",
                    )}
                    style={{ top: pct(at.y) }}
                  >
                    {member.findings}
                  </p>
                ) : null}
              </div>
            );
          })}
          {tags.map((tag) => {
            const at = project(tag.at);
            return (
              <p
                key={tag.id}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-full font-mono text-[clamp(0.625rem,1cqw,0.6875rem)] whitespace-nowrap",
                  TONE_TEXT[tag.tone],
                )}
                style={{ left: pct(at.x), top: pct(at.y) }}
                data-testid={`tunnel-tag-${tag.id.split(":")[0]}`}
              >
                {tag.text}
              </p>
            );
          })}
        </div>
      </div>
      <CrewList crew={crew} />
    </div>
  );
}
