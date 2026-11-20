"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { tipKey, tipOf, type Tip } from "@/lib/viz/tunnel-tips";

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

const TONE_DOT: Record<SceneTone, string> = {
  brand: "bg-brand",
  ok: "bg-ok",
  warning: "bg-sev-high",
  danger: "bg-sev-critical",
  muted: "bg-muted-foreground/50",
};

/** What the pointer is on: its key, and where it is, as fractions. */
interface Aim {
  key: string;
  x: number;
  y: number;
}

/**
 * The card for the thing the pointer is on: over it, or under it near the
 * top; pulled in from the sides so it stays inside the drawing.
 */
function TipCard({ tip, at, kept }: { tip: Tip; at: Aim; kept: boolean }) {
  const below = at.y < 0.3;
  const shift = at.x > 0.78 ? "-100%" : at.x < 0.18 ? "0%" : "-50%";
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 w-max max-w-72 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
        kept && "ring-1 ring-brand/40",
      )}
      style={{
        left: pct(at.x),
        top: pct(at.y),
        transform: `translate(${shift}, ${below ? "14px" : "calc(-100% - 14px)"})`,
      }}
      data-testid="tunnel-tip"
      data-kept={kept}
    >
      <p className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tip.tone])}
        />
        {tip.eyebrow}
      </p>
      <p className="mt-0.5 text-[0.8125rem] leading-snug font-medium text-foreground">
        {tip.title}
      </p>
      {tip.detail ? (
        <p className="mt-1 leading-snug text-muted-foreground">{tip.detail}</p>
      ) : null}
      {tip.mono ? (
        <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
          {tip.mono}
        </p>
      ) : null}
    </div>
  );
}

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
  // Every ball answers the pointer: hover shows its card, a click keeps it.
  const [hover, setHover] = useState<Aim | null>(null);
  const [kept, setKept] = useState<Aim | null>(null);
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

  // The thing shown grows in the scene; a rebuilt scene grows it again.
  const active = kept ?? hover;
  useEffect(() => {
    engine.current?.highlight(active?.key ?? null);
  }, [active?.key, ready]);

  // Escape lets a kept card go.
  useEffect(() => {
    if (!kept) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setKept(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [kept]);

  const rows = rows3d(crew.members.length);
  const tags = tagsOf(scene, crew.ended);

  /** What is under the pointer: a worker's name, else what the scene finds. */
  const aimAt = useCallback(
    (event: React.PointerEvent | React.MouseEvent): Aim | null => {
      const stage = event.currentTarget as HTMLElement;
      const named = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-tip]",
      );
      if (named?.dataset.tip) {
        const index = Number(named.dataset.row);
        const at = project([T.end, rows[index] ?? 0, 0]);
        return { key: named.dataset.tip, x: at.x, y: at.y };
      }
      const box = stage.getBoundingClientRect();
      return (
        engine.current?.pick(
          event.clientX - box.left,
          event.clientY - box.top,
          box.width,
          box.height,
        ) ?? null
      );
    },
    [rows],
  );
  const tip = active ? tipOf(active.key, scene, crew) : null;
  return (
    <div
      ref={box}
      className={cn(
        "@container px-5 md:px-6",
        // The drawing's own area has its own colour, very subtle: a touch
        // darker than the panel in the dark theme, a faint violet tint in
        // the light one. The lines are the app's violet (paler in the dark
        // theme, where they glow).
        "[--wt-bg:color-mix(in_oklab,var(--brand)_5%,var(--card))]",
        "dark:[--wt-bg:color-mix(in_oklab,var(--card)_86%,black)]",
        "[--wt-ink:var(--foreground)]",
        "[--wt-line:var(--brand)] dark:[--wt-line:#c9c2ff]",
        // The turbine's matte metal: mid greys, a touch cool.
        "[--wt-metal:#b9bbc1] dark:[--wt-metal:#8e8ea2]",
        "[--wt-blade:#8f9198] dark:[--wt-blade:#5e5e72]",
        "[--wt-frame:#c3c4c8] dark:[--wt-frame:#3a3b40]",
      )}
      data-testid="wind-tunnel-3d"
      data-ready={ready}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-card bg-[var(--wt-bg)] ring-1 ring-foreground/[0.06]",
          hover && "cursor-pointer",
        )}
        style={{ aspectRatio: `${T.aspect}` }}
        role="img"
        aria-label={crew.sentence}
        data-testid="tunnel-stage"
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const aim = aimAt(event);
          setHover((now) =>
            now?.key === aim?.key && now?.x === aim?.x ? now : aim,
          );
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const aim = aimAt(event);
          setKept((now) => (aim && now?.key !== aim.key ? aim : null));
        }}
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
                  data-tip={tipKey("worker", member.id)}
                  data-row={index}
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
          {tip && active ? (
            <TipCard tip={tip} at={active} kept={Boolean(kept)} />
          ) : null}
        </div>
      </div>
      <CrewList crew={crew} />
    </div>
  );
}
