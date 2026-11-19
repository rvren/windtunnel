"use client";

import {
  useCallback,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { motion } from "motion/react";

import { DrawLine, FlowDash, GrowIn, Spark, Spin } from "@/components/motion";
import { cn } from "@/lib/utils";
import type { Feed } from "@/lib/run-feed";
import type { Crew, CrewMember } from "@/lib/viz/crew";
import { tunnelScene } from "@/lib/viz/tunnel-scene";
import type { RunRecord } from "@/server/engine/schema";
import { APP, TUNNEL, appOutline, crossing, rowOf } from "@/lib/viz/tunnel";

import { clip, CrewList } from "./parts";
import { WindTunnel3D } from "./tunnel-3d/wind-tunnel-3d";

/*
 * The wind tunnel: a run's crew at work (the five agents, a fly-off's
 * designers and judge, a black box's investigator and fixer). A turbine
 * comes out of the left wall and turns while the run goes on; a rake lets
 * out one stream per worker: a simple line with a soft glow. The streams
 * run level, straight into the application (a stack of layers in 3D,
 * floating in the middle), fade where they touch it, and come out the
 * other side to a small dot beside each worker's name and count. A light
 * travels a stream while its worker works, and a finding leaves the
 * application as a spark. When the run ends the turbine stops, and each
 * stream and its dot turn green (red where work failed).
 *
 * Where everything stands is src/lib/viz/tunnel.ts.
 */

const { W, H, MID, RAKE, FROM, TO } = TUNNEL;
const BOX = { x: APP.x - APP.w / 2, y: APP.y - APP.h / 2, w: APP.w, h: APP.h };
const LABEL = TO + 24;
/** The right edge of the counts: the drawing runs to the panel's edge. */
const RIGHT = W - 30;
/**
 * The turbine: the centre and radius of its mouth, seen at an angle
 * (squeezed sideways), the width of its lip, and how far back in the duct
 * the fan sits. Its body runs back into the left wall.
 */
const TURBINE = { x: 126, y: MID, r: 80, squeeze: 0.46, lip: 15, deep: 0.24 };
/** The nose cone's cross-sections, from its base (0) to its tip (1). */
const NOSE = Array.from({ length: 30 }, (_, index) => index / 29);
/** Its blades: wide, swept, and overlapping, as on a turbofan. */
const BLADES = Array.from({ length: 22 }, (_, index) => (index * 360) / 22);

/**
 * One wide, swept blade, pointing right from the spinner: its leading
 * edge sweeps forward to the tip, its tip follows the duct, and its
 * trailing edge comes back to the spinner. Wider than the space between
 * two blades, so each overlaps the next.
 */
function bladePath(r: number): string {
  const hub = r * 0.3;
  const point = (radius: number, degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    return `${radius * Math.cos(angle)} ${radius * Math.sin(angle)}`;
  };
  return [
    `M${point(hub, -14)}`,
    `C${r * 0.5} ${-r * 0.2} ${r * 0.74} ${-r * 0.36} ${point(r, -21)}`,
    `A${r} ${r} 0 0 1 ${point(r, 2)}`,
    `C${r * 0.76} ${r * 0.0} ${r * 0.52} ${r * 0.07} ${point(hub, 17)}`,
    "Z",
  ].join(" ");
}

interface SceneIds {
  halo: string;
  body: string;
  lip: string;
  duct: string;
  blade: string;
  spinner: string;
  mouth: string;
  haze: string;
  feather: string;
  clear: string;
  fade: string;
  good: string;
  bad: string;
}

/**
 * The turbine: a turbofan coming out of the left wall. A shaded nacelle
 * with its panel lines; a bright metal lip; inside it the duct, with the
 * fan set back in it (so the duct's far wall shows beside the fan); wide
 * metal blades that overlap round the spinner's cone, turning while the
 * run goes on. The duct glows while it turns. Colours come from the
 * --wt-* variables, one set per theme.
 */
function Turbine({
  turning,
  fast,
  ids,
}: {
  turning: boolean;
  /** Workers are at work: it turns at full speed. */
  fast: boolean;
  ids: SceneIds;
}) {
  const { x, y, r, squeeze, lip, deep } = TURBINE;
  const outer = r + lip;
  const fan = r * 0.95;
  const blade = bladePath(fan);
  // The spinner's base, and where its tip lands seen from this angle.
  const hub = fan * 0.3;
  const reach = hub * 1.75;
  return (
    <g aria-hidden="true">
      {/* Its light, spilling into the room. */}
      <ellipse
        cx={x + 40}
        cy={y}
        rx={290}
        ry={205}
        fill={`url(#${ids.halo})`}
        opacity={turning ? 1 : 0.4}
      />

      {/* The nacelle, running back into the wall: shaded from a light top
          to a dark underside. */}
      <path
        d={`M${x} ${y - outer} C${x - 50} ${y - outer} ${x - 100} ${y - outer + 5} -30 ${y - outer + 13} L-30 ${y + outer - 13} C${x - 100} ${y + outer - 5} ${x - 50} ${y + outer} ${x} ${y + outer} Z`}
        fill={`url(#${ids.body})`}
        strokeWidth={1}
        className="stroke-foreground/15"
      />
      {/* Panel seams round the body. Only the half of each ring that
          faces us is drawn (the left of its ellipse, from this angle), as
          a groove: a dark line with a faint light edge beside it. */}
      {[46, 92].map((back) => {
        const rx = outer * squeeze * 0.97;
        const ry = outer - 1 - back * 0.085;
        const seam = (dx: number) =>
          `M${x - back + dx} ${y - ry} A${rx} ${ry} 0 0 0 ${x - back + dx} ${y + ry}`;
        return (
          <g key={back} fill="none" strokeLinecap="round">
            <path d={seam(0)} strokeWidth={1.1} stroke="var(--wt-seam)" />
            <path
              d={seam(1.4)}
              strokeWidth={0.8}
              stroke="var(--wt-metal-hi)"
              opacity={0.28}
            />
          </g>
        );
      })}

      {/* Its mouth, seen at an angle. */}
      <g transform={`translate(${x} ${y}) scale(${squeeze} 1)`}>
        <clipPath id={ids.mouth}>
          <circle r={r} />
        </clipPath>
        {/* The duct, darker the deeper it goes; lit while it turns. */}
        <circle r={r} fill="var(--wt-duct-deep)" />
        <circle r={r} fill={`url(#${ids.duct})`} opacity={turning ? 1 : 0.35} />
        {/* The fan, set back in the duct. */}
        <g clipPath={`url(#${ids.mouth})`}>
          <g transform={`translate(${-r * deep} 0)`}>
            <Spin on={turning} duration={fast ? 0.8 : 2.8}>
              {/* Keeps the group's centre on the spinner, so it turns true. */}
              <circle r={fan} fill="none" />
              {BLADES.map((angle) => (
                <path
                  key={angle}
                  transform={`rotate(${angle})`}
                  d={blade}
                  fill={`url(#${ids.blade})`}
                  stroke="var(--wt-blade-edge)"
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                />
              ))}
            </Spin>
            {/* At full speed the blades blur into a disc. */}
            {fast ? (
              <circle
                r={fan}
                fill="var(--wt-blade-mid)"
                opacity={0.28}
                className="pointer-events-none"
              />
            ) : null}
            {/* The spinner: a nose cone pointing out of the fan. It is
                drawn as its own cross-sections, base first and tip last,
                each a little smaller and further along the axis: together
                they give the outline and the shading of a rounded cone
                seen from this angle. */}
            <circle r={hub + 1.2} fill="var(--wt-blade-edge)" />
            {NOSE.map((t) => (
              <circle
                key={t}
                cx={reach * t}
                r={Math.max(0.5, hub * (1 - t ** 1.6))}
                fill={`url(#${ids.spinner})`}
              />
            ))}
          </g>
        </g>
        {/* The lip: bright metal, with a fine line on each side. */}
        <circle
          r={r + lip / 2}
          fill="none"
          strokeWidth={lip}
          stroke={`url(#${ids.lip})`}
        />
        <circle
          r={r}
          fill="none"
          strokeWidth={1}
          className="stroke-foreground/30"
        />
        <circle
          r={outer}
          fill="none"
          strokeWidth={1}
          className="stroke-foreground/20"
        />
      </g>
    </g>
  );
}

/** The rake: a fine pole with one nozzle per stream. */
function SmokeRake({ rows }: { rows: number[] }) {
  return (
    <g aria-hidden="true">
      <line
        x1={RAKE}
        y1={Math.min(...rows) - 18}
        x2={RAKE}
        y2={Math.max(...rows) + 18}
        strokeWidth={1.25}
        strokeLinecap="round"
        className="stroke-foreground/20"
      />
      {rows.map((y) => (
        <circle
          key={y}
          cx={RAKE}
          cy={y}
          r={3}
          strokeWidth={1.25}
          className="fill-card stroke-foreground/40"
        />
      ))}
    </g>
  );
}

/** The three layers of the application, from the top down. */
const LAYERS = ["Interface", "Services", "Data"] as const;

/**
 * The application under test, as three floating layers seen from above at
 * an angle: its interface, its services (the project's workspaces, each
 * lit while an agent reads its code) and its data. The layers spread apart
 * while the agents take the app apart, and settle when they are done.
 * Sized in container units, so it scales with the drawing; its angles and
 * sizes are APP in src/lib/viz/tunnel.ts, which also gives the outline the
 * streams fade into.
 */
function AppStack({
  subject,
  workspaces,
  reading,
  live,
  outcome,
}: {
  subject: string;
  workspaces: string[];
  /** Workspaces an agent is reading now. */
  reading: Set<string>;
  live: boolean;
  outcome: Crew["outcome"];
}) {
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;
  const gap = live ? APP.spread : APP.rest;
  const shown = workspaces.slice(0, 8);
  const side = pct((1 - APP.plate.w) / 2, 1);
  const end = pct((1 - APP.plate.h) / 2, 1);
  return (
    <div
      aria-hidden="true"
      className="absolute"
      style={{
        left: pct(BOX.x, W),
        top: pct(BOX.y, H),
        width: pct(BOX.w, W),
        height: pct(BOX.h, H),
      }}
    >
      <div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{
          transform: `rotateX(${APP.tilt}deg) rotateZ(-${APP.turn}deg)`,
        }}
      >
        {LAYERS.map((layer, index) => {
          // The middle layer stays put; the others move up and down from it.
          const z = ((LAYERS.length - 1) / 2 - index) * gap;
          return (
            <motion.div
              key={layer}
              className="absolute [transform-style:preserve-3d]"
              style={{ left: side, right: side, top: end, bottom: end }}
              initial={false}
              animate={{ z: `${z}cqw` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* The plate's edge, then its face. */}
              <div className="absolute inset-0 translate-y-[0.45cqw] rounded-[1.2cqw] bg-foreground/15" />
              <div
                className={cn(
                  "absolute inset-0 overflow-hidden rounded-[1.2cqw] border p-[0.9cqw]",
                  index === 0
                    ? "bg-card/75"
                    : index === 1
                      ? "bg-card/85"
                      : "bg-card",
                  outcome === "completed"
                    ? "border-ok/40"
                    : outcome === "failed"
                      ? "border-sev-critical/40"
                      : live
                        ? "border-brand/50"
                        : "border-foreground/20",
                  live &&
                    index === 0 &&
                    "shadow-[0_0_3cqw_-0.5cqw_var(--glow)]",
                )}
              >
                {index === 0 ? (
                  <div className="flex h-full flex-col gap-[0.6cqw]">
                    <div className="flex items-center gap-[0.4cqw]">
                      <span className="size-[0.5cqw] rounded-full bg-foreground/30" />
                      <span className="size-[0.5cqw] rounded-full bg-foreground/30" />
                      <span className="size-[0.5cqw] rounded-full bg-foreground/30" />
                      <span className="ml-[0.4cqw] truncate text-[1.1cqw] leading-none font-medium">
                        {subject}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "h-[2.2cqw] rounded-[0.5cqw]",
                        live ? "bg-brand/20" : "bg-foreground/[0.07]",
                      )}
                    />
                    <div className="h-[0.5cqw] w-4/5 rounded-full bg-foreground/10" />
                    <div className="h-[0.5cqw] w-3/5 rounded-full bg-foreground/10" />
                  </div>
                ) : index === 1 ? (
                  <div className="grid h-full grid-cols-2 content-center gap-[0.4cqw]">
                    {shown.length === 0
                      ? // No code yet: the services are still to be built.
                        [0, 1, 2, 3].map((slot) => (
                          <span
                            key={slot}
                            className="h-[1.6cqw] rounded-[0.4cqw] border border-dashed border-foreground/20"
                          />
                        ))
                      : null}
                    {shown.map((name) => (
                      <span
                        key={name}
                        className={cn(
                          "truncate rounded-[0.4cqw] border px-[0.3cqw] py-[0.35cqw] text-center font-mono text-[0.8cqw] leading-none transition-colors duration-300",
                          reading.has(name)
                            ? "glow border-brand bg-brand/25 text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="dot-grid h-full rounded-[0.6cqw]" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How a worker's stream ends once the run is over: green for work done,
 * red for work that failed or never finished; none for a worker never
 * started.
 */
function verdictOf(
  member: CrewMember,
  outcome: Crew["outcome"],
): "good" | "bad" | null {
  if (!outcome || member.status === "pending") return null;
  if (outcome === "completed") {
    return member.status === "failed" || member.status === "declined"
      ? "bad"
      : "good";
  }
  return member.status === "done" ? "good" : "bad";
}

/** One worker's stream, worked out once for every layer that draws it. */
interface StreamOf {
  member: CrewMember;
  row: number;
  d: string;
  /** Where a finding leaves the application, on this stream. */
  wake: [number, number];
  verdict: "good" | "bad" | null;
  delay: number;
  /** The run is going on: names only, nothing under them. */
  quiet: boolean;
}

/**
 * The glow round one stream: the same line, wider and faint, drawn inside
 * the group that blurs it. None until its worker starts.
 */
function Glow({ stream, ids }: { stream: StreamOf; ids: SceneIds }) {
  const { member, d, verdict } = stream;
  if (member.status === "pending") return null;
  return (
    <path
      d={d}
      fill="none"
      strokeWidth={5}
      strokeLinecap="round"
      stroke={verdict ? `url(#${ids[verdict]})` : `url(#${ids.fade})`}
      opacity={verdict ? 0.45 : member.status === "running" ? 0.5 : 0.28}
    />
  );
}

/**
 * The stream itself: one simple line. Faint until its worker starts.
 * While the worker works a light travels along it; once the run is over
 * the outcome's colour runs down it.
 */
function Line({ stream, ids }: { stream: StreamOf; ids: SceneIds }) {
  const { member, d, verdict, delay } = stream;
  const pending = member.status === "pending";
  const live = member.status === "running";
  return (
    <g fill="none" strokeLinecap="round">
      <path
        d={d}
        strokeWidth={1.25}
        stroke={`url(#${ids.fade})`}
        opacity={pending ? 0.3 : verdict ? 0.25 : live ? 1 : 0.7}
      />
      {verdict ? (
        <DrawLine
          d={d}
          stroke={`url(#${ids[verdict]})`}
          width={1.4}
          delay={delay}
        />
      ) : null}
      {live ? (
        <FlowDash
          d={d}
          stroke="var(--wt-pulse)"
          width={1.8}
          dash={90}
          duration={2.4}
          className="glow"
        />
      ) : null}
    </g>
  );
}

/**
 * Where a stream ends, beside its worker's name: a small dot that says
 * the worker's state. A ring while it waits, violet while it works, and
 * once the run is over green for work done or red for work that failed.
 */
function EndNode({
  y,
  state,
  delay,
}: {
  y: number;
  state: "idle" | "live" | "done" | "good" | "bad";
  delay: number;
}) {
  if (state === "good" || state === "bad") {
    const color = state === "good" ? "var(--ok)" : "var(--sev-critical)";
    return (
      <GrowIn delay={delay + 0.9}>
        <circle cx={TO} cy={y} r={9} fill={color} opacity={0.16} />
        <circle cx={TO} cy={y} r={4} fill={color} />
      </GrowIn>
    );
  }
  return (
    <circle
      cx={TO}
      cy={y}
      r={3.5}
      strokeWidth={1.5}
      className={cn(
        state === "live"
          ? "glow-soft fill-card stroke-brand"
          : state === "done"
            ? "fill-foreground/40 stroke-transparent"
            : "fill-card stroke-foreground/20",
      )}
    />
  );
}

/** What is written at the end of a stream: the worker, its dot, its count. */
function Marks({ stream }: { stream: StreamOf }) {
  const { member, row: y, verdict, delay, wake, quiet } = stream;
  const live = member.status === "running";
  const pending = member.status === "pending";
  // A worker with no count beside it has the whole width for its words.
  const room = member.findings === null ? 32 : 24;
  // What it came to, under its name, once the run is over.
  const note = quiet ? null : member.note;
  return (
    <g>
      {member.latest ? (
        <Spark
          key={member.latest.uid}
          from={wake}
          to={[TO, y]}
          fill={member.latest.color}
          r={3.5}
        />
      ) : null}
      <EndNode
        y={y}
        state={verdict ?? (live ? "live" : pending ? "idle" : "done")}
        delay={delay}
      />
      <text
        x={LABEL}
        y={note ? y - 2 : y + 5}
        className={cn(
          "text-[15px] @max-lg:hidden",
          pending ? "fill-muted-foreground" : "fill-foreground",
        )}
      >
        {member.name}
      </text>
      {note ? (
        <text
          x={LABEL}
          y={y + 15}
          className={cn(
            "fill-muted-foreground text-[11px] @max-lg:hidden",
            member.status === "failed" && "fill-sev-critical",
          )}
        >
          {clip(note, room)}
        </text>
      ) : null}
      {member.findings !== null ? (
        <text
          x={RIGHT}
          y={y + 8}
          textAnchor="end"
          className={cn(
            "text-[24px] font-light tabular-nums @max-lg:hidden",
            member.findings > 0
              ? "fill-foreground"
              : "fill-muted-foreground/40",
          )}
        >
          {member.findings}
        </text>
      ) : member.status === "done" ? (
        <path
          d={`M${RIGHT - 16} ${y} l5 5 l10 -11`}
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-ok @max-lg:hidden"
        />
      ) : member.status === "failed" || member.status === "declined" ? (
        <path
          d={`M${RIGHT - 14} ${y - 6} l12 12 M${RIGHT - 2} ${y - 6} l-12 12`}
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          className="stroke-sev-critical @max-lg:hidden"
        />
      ) : null}
    </g>
  );
}

/** The tunnel in 2D: where WebGL cannot draw the 3D one. */
export function WindTunnelFlat({
  crew,
  subject,
  workspaces = [],
}: {
  crew: Crew;
  subject: string;
  /** The project's workspaces, shown as its services. */
  workspaces?: string[];
}) {
  const reading = new Set(
    crew.members
      .filter((member) => member.status === "running" && member.doing)
      .map((member) => member.doing!.split("/")[0]),
  );
  const live = !crew.ended && crew.members.some((m) => m.status === "running");
  const id = useId().replace(/:/g, "");
  const ids: SceneIds = {
    halo: `wt-halo-${id}`,
    body: `wt-body-${id}`,
    lip: `wt-lip-${id}`,
    duct: `wt-duct-${id}`,
    blade: `wt-blade-${id}`,
    spinner: `wt-spinner-${id}`,
    mouth: `wt-mouth-${id}`,
    haze: `wt-haze-${id}`,
    feather: `wt-feather-${id}`,
    clear: `wt-clear-${id}`,
    fade: `wt-fade-${id}`,
    good: `wt-good-${id}`,
    bad: `wt-bad-${id}`,
  };
  const count = crew.members.length;
  // The application's outline now: wider while its layers are spread.
  const gap = live ? APP.spread : APP.rest;
  const outline = appOutline(gap);
  const streams: StreamOf[] = crew.members.map((member, index) => {
    const row = rowOf(index, count);
    return {
      member,
      row,
      // Level, from the rake to its end: straight through the application.
      d: `M${FROM} ${row} H${TO}`,
      wake: [(crossing(row, gap)?.[1] ?? APP.x) + 6, row],
      verdict: verdictOf(member, crew.outcome),
      delay: index * 0.12,
      quiet: !crew.ended,
    };
  });
  // Filters are sized in the drawing's own units: a level stream has no
  // height of its own to size a filter by.
  const frame = { x: 0, y: -40, width: W, height: H + 40 };
  const whole = { filterUnits: "userSpaceOnUse" as const, ...frame };
  return (
    <div
      className={cn(
        "@container",
        // The tunnel's light, metal and smoke: quiet in the light theme,
        // bright against the dark one.
        "[--wt-glow:color-mix(in_oklab,var(--brand)_14%,transparent)] dark:[--wt-glow:color-mix(in_oklab,var(--brand)_50%,transparent)]",
        "[--wt-room:color-mix(in_oklab,var(--brand)_5%,transparent)] dark:[--wt-room:color-mix(in_oklab,var(--brand)_18%,transparent)]",
        "[--wt-metal-hi:rgb(255_255_255)] dark:[--wt-metal-hi:rgb(96_96_110)]",
        "[--wt-metal-mid:rgb(243_243_248)] dark:[--wt-metal-mid:rgb(42_42_50)]",
        "[--wt-metal-low:rgb(214_214_226)] dark:[--wt-metal-low:rgb(13_13_16)]",
        "[--wt-seam:rgb(60_60_90/0.2)] dark:[--wt-seam:rgb(0_0_0/0.55)]",
        "[--wt-lip-hi:rgb(255_255_255)] dark:[--wt-lip-hi:rgb(236_236_246)]",
        "[--wt-lip-mid:rgb(228_228_238)] dark:[--wt-lip-mid:rgb(120_120_136)]",
        "[--wt-lip-low:rgb(190_190_206)] dark:[--wt-lip-low:rgb(44_44_54)]",
        "[--wt-duct-deep:rgb(202_202_218)] dark:[--wt-duct-deep:rgb(6_6_8)]",
        "[--wt-duct-lit:color-mix(in_oklab,var(--brand)_38%,white)] dark:[--wt-duct-lit:color-mix(in_oklab,var(--brand)_75%,black)]",
        "[--wt-blade-hi:rgb(255_255_255)] dark:[--wt-blade-hi:rgb(140_140_156)]",
        "[--wt-blade-mid:rgb(226_226_236)] dark:[--wt-blade-mid:rgb(50_50_60)]",
        "[--wt-blade-low:rgb(172_172_190)] dark:[--wt-blade-low:rgb(14_14_18)]",
        "[--wt-blade-edge:rgb(70_70_100/0.32)] dark:[--wt-blade-edge:rgb(0_0_0/0.6)]",
        "[--wt-smoke:color-mix(in_oklab,var(--brand)_70%,transparent)] dark:[--wt-smoke:rgb(255_255_255/0.85)]",
        "[--wt-pulse:var(--brand)] dark:[--wt-pulse:color-mix(in_oklab,var(--brand)_35%,white)]",
      )}
    >
      <div
        className="@container relative w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 size-full overflow-visible"
          role="img"
          aria-label={crew.sentence}
        >
          <defs>
            <radialGradient id={ids.halo}>
              <stop offset="0" style={{ stopColor: "var(--wt-glow)" }} />
              <stop offset="0.45" style={{ stopColor: "var(--wt-room)" }} />
              <stop offset="1" stopColor="transparent" stopOpacity={0} />
            </radialGradient>
            {/* The nacelle: lit along the top, dark underneath. */}
            <linearGradient id={ids.body} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--wt-metal-mid)" }} />
              <stop offset="0.16" style={{ stopColor: "var(--wt-metal-hi)" }} />
              <stop offset="0.5" style={{ stopColor: "var(--wt-metal-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--wt-metal-low)" }} />
            </linearGradient>
            {/* The lip: polished, brightest up and to the left. */}
            <linearGradient id={ids.lip} x1="0.1" y1="0" x2="0.9" y2="1">
              <stop offset="0" style={{ stopColor: "var(--wt-lip-hi)" }} />
              <stop offset="0.4" style={{ stopColor: "var(--wt-lip-mid)" }} />
              <stop offset="0.75" style={{ stopColor: "var(--wt-lip-low)" }} />
              <stop offset="1" style={{ stopColor: "var(--wt-lip-mid)" }} />
            </linearGradient>
            {/* The duct's far wall, lit from the fan while it turns. */}
            <linearGradient id={ids.duct} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0.45" stopColor="transparent" stopOpacity={0} />
              <stop offset="1" style={{ stopColor: "var(--wt-duct-lit)" }} />
            </linearGradient>
            {/* A blade: bright at its leading edge, dark at its trailing
                one. It turns with the blade. */}
            <linearGradient id={ids.blade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--wt-blade-hi)" }} />
              <stop offset="0.3" style={{ stopColor: "var(--wt-blade-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--wt-blade-low)" }} />
            </linearGradient>
            {/* The spinner's cone: lit from above. */}
            <linearGradient id={ids.spinner} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.05" style={{ stopColor: "var(--wt-blade-hi)" }} />
              <stop
                offset="0.45"
                style={{ stopColor: "var(--wt-blade-mid)" }}
              />
              <stop offset="1" style={{ stopColor: "var(--wt-blade-low)" }} />
            </linearGradient>
            {/* Blurs are sized in the drawing's own units: a level stream
                has no height of its own to size a filter by. */}
            <filter id={ids.haze} {...whole}>
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
            {/* What hides the streams where they touch the application:
                its own outline, soft at the edge, so a stream fades as it
                goes in and comes back as it leaves. */}
            <filter id={ids.feather} {...whole}>
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <mask id={ids.clear} maskUnits="userSpaceOnUse" {...frame}>
              <rect {...frame} fill="white" />
              <polygon
                points={outline.map((point) => point.join(",")).join(" ")}
                fill="black"
                stroke="black"
                strokeWidth={10}
                strokeLinejoin="round"
                filter={`url(#${ids.feather})`}
              />
            </mask>
            {/* A stream fades in from its nozzle. */}
            <linearGradient
              id={ids.fade}
              gradientUnits="userSpaceOnUse"
              x1={FROM}
              y1={0}
              x2={TO}
              y2={0}
            >
              <stop
                offset="0"
                style={{ stopColor: "var(--wt-smoke)" }}
                stopOpacity={0.2}
              />
              <stop
                offset="0.35"
                style={{ stopColor: "var(--wt-smoke)" }}
                stopOpacity={0.85}
              />
              <stop
                offset="1"
                style={{ stopColor: "var(--wt-smoke)" }}
                stopOpacity={0.7}
              />
            </linearGradient>
            {(["good", "bad"] as const).map((verdict) => {
              const color =
                verdict === "good" ? "var(--ok)" : "var(--sev-critical)";
              return (
                <linearGradient
                  key={verdict}
                  id={ids[verdict]}
                  gradientUnits="userSpaceOnUse"
                  x1={FROM}
                  y1={0}
                  x2={TO}
                  y2={0}
                >
                  <stop offset="0" stopColor={color} stopOpacity={0.1} />
                  <stop offset="0.6" stopColor={color} stopOpacity={0.5} />
                  <stop offset="1" stopColor={color} stopOpacity={0.95} />
                </linearGradient>
              );
            })}
          </defs>
          <Turbine turning={!crew.ended} fast={live} ids={ids} />
          {/* The streams, hidden where they touch the application: their
              glow as one soft layer, then the lines themselves. */}
          <g mask={`url(#${ids.clear})`}>
            <g filter={`url(#${ids.haze})`}>
              {streams.map((stream) => (
                <Glow key={stream.member.id} stream={stream} ids={ids} />
              ))}
            </g>
            {streams.map((stream) => (
              <Line key={stream.member.id} stream={stream} ids={ids} />
            ))}
          </g>
          <SmokeRake rows={streams.map((stream) => stream.row)} />
          {streams.map((stream) => (
            <Marks key={stream.member.id} stream={stream} />
          ))}
        </svg>
        {/* The application, which the streams run into. */}
        <AppStack
          subject={subject}
          workspaces={workspaces}
          reading={reading}
          live={live}
          outcome={crew.outcome}
        />
      </div>
      <CrewList crew={crew} />
    </div>
  );
}

let webglKnown: boolean | null = null;

/** Whether this browser can draw WebGL; asked once. */
function hasWebgl(): boolean {
  if (webglKnown === null) {
    try {
      const canvas = document.createElement("canvas");
      webglKnown = Boolean(
        canvas.getContext("webgl2") ?? canvas.getContext("webgl"),
      );
    } catch {
      webglKnown = false;
    }
  }
  return webglKnown;
}

const noSubscribe = () => () => {};

/**
 * The run page's wind tunnel: in 3D, with what the run's kind adds
 * (src/lib/viz/tunnel-scene.ts); in 2D where WebGL cannot draw.
 */
export function WindTunnel({
  crew,
  subject,
  workspaces = [],
  run,
  feed,
}: {
  crew: Crew;
  subject: string;
  /** The project's workspaces, shown as its services. */
  workspaces?: string[];
  /** The run and its live feed: what each kind adds comes from them. */
  run: RunRecord;
  feed: Feed;
}) {
  const webgl = useSyncExternalStore(noSubscribe, hasWebgl, () => true);
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const scene = useMemo(() => tunnelScene(run, feed), [run, feed]);
  if (!webgl || failed) {
    return (
      <WindTunnelFlat crew={crew} subject={subject} workspaces={workspaces} />
    );
  }
  return (
    <WindTunnel3D crew={crew} scene={scene} subject={subject} onFail={onFail} />
  );
}
