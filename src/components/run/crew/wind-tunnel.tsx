"use client";

import { motion } from "motion/react";

import { DrawLine, FlowDash, Spark } from "@/components/motion";
import { cn } from "@/lib/utils";
import type { Crew, CrewMember } from "@/lib/viz/crew";

import { clip } from "./parts";

/*
 * The wind tunnel: a run's crew at work (the five agents, a fly-off's
 * designers and judge, a black box's investigator and fixer). The
 * application sits in the middle, as a stack of layers in 3D. Each worker
 * is a line of air that parts around it; a single light travels along the
 * line while it works. A finding (or a finished piece of work) breaks off
 * as a spark and lands at the end of its line. When the run ends each line
 * draws through to an arrow, green for work done and red for work that
 * failed, and the app's edge takes the run's colour.
 */

const W = 1000;
const H = 430;
const MID = H / 2;
const GAP = 58;
const BOX = { x: 455, y: MID - 150, w: 210, h: 300 };
const FROM = 250;
const TO = 850;
/**
 * How far a line is pushed at the app: a base, and more for each step
 * further from the middle. The middle line (in an odd crew) meets it.
 */
const PUSH_BASE = 78;
const PUSH_STEP = 50;

/** The three layers of the application, from the top down. */
const LAYERS = ["Interface", "Services", "Data"] as const;

/**
 * The application under test, as three floating layers seen from above at
 * an angle: its interface, its services (the project's workspaces, each
 * lit while an agent reads its code) and its data. The layers spread apart
 * while the agents take the app apart, and settle when they are done.
 * Sized in container units, so it scales with the drawing.
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
  const gap = live ? 9 : 6.5;
  const shown = workspaces.slice(0, 8);
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
      <div className="absolute inset-0 [transform:rotateX(60deg)_rotateZ(-40deg)] [transform-style:preserve-3d]">
        {LAYERS.map((layer, index) => {
          // The middle layer stays put; the others move up and down from it.
          const z = ((LAYERS.length - 1) / 2 - index) * gap;
          return (
            <motion.div
              key={layer}
              className="absolute inset-x-[12%] inset-y-[22%] [transform-style:preserve-3d]"
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
                    ? "border-ok/60"
                    : outcome === "failed"
                      ? "border-sev-critical/60"
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

/** A line's distance from the middle, in rows: -2 … 2, or -1.5 … 1.5. */
const offsetOf = (index: number, count: number) => index - (count - 1) / 2;

function streamOf(offset: number): string {
  const y = MID + offset * GAP;
  if (offset === 0) return `M${FROM} ${y} H${TO}`;
  const at =
    MID + Math.sign(offset) * (PUSH_BASE + Math.abs(offset) * PUSH_STEP);
  return `M${FROM} ${y} H390 C450 ${y} 465 ${at} 560 ${at} S670 ${y} 730 ${y} H${TO}`;
}

/**
 * How a worker's line ends once the run is over: green for work done, red
 * for work that failed or never finished; none for a worker never started.
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

function Stream({
  member,
  offset,
  outcome,
  delay,
}: {
  member: CrewMember;
  offset: number;
  outcome: Crew["outcome"];
  /** When its outcome starts to draw, in seconds: one line after another. */
  delay: number;
}) {
  const y = MID + offset * GAP;
  const d = streamOf(offset);
  const live = member.status === "running";
  const pending = member.status === "pending";
  const verdict = verdictOf(member, outcome);
  const mark = verdict === "good" ? "stroke-ok" : "stroke-sev-critical";
  return (
    <g>
      <text
        x={0}
        y={live || member.note ? y - 2 : y + 5}
        className={cn(
          "text-[15px] @max-lg:hidden",
          pending ? "fill-muted-foreground" : "fill-foreground",
        )}
      >
        {member.name}
      </text>
      {live || member.note ? (
        <text
          x={0}
          y={y + 15}
          className={cn(
            "fill-muted-foreground text-[11px] @max-lg:hidden",
            // A file in mono; a step in words in the body face.
            live && !member.doing?.includes(" ") && "font-mono",
            member.status === "failed" && "fill-sev-critical",
          )}
        >
          {live ? clip(member.doing ?? "starting", 34) : clip(member.note, 34)}
        </text>
      ) : null}

      <path
        d={d}
        fill="none"
        strokeWidth={1.25}
        className={
          live
            ? "stroke-brand/45"
            : pending || verdict
              ? "stroke-foreground/10"
              : "stroke-foreground/20"
        }
      />
      {verdict ? (
        <>
          {/* The outcome runs down the line and ends in an arrow. */}
          <DrawLine d={d} className={cn(mark, "opacity-70")} delay={delay} />
          <path
            d={`M${TO - 10} ${y - 6} L${TO} ${y} L${TO - 10} ${y + 6}`}
            fill="none"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={mark}
          />
        </>
      ) : null}
      {live ? (
        <FlowDash
          d={d}
          stroke="var(--brand)"
          width={2}
          dash={90}
          duration={2.6}
          className="glow"
        />
      ) : null}

      {member.latest ? (
        <Spark
          key={member.latest.uid}
          from={[BOX.x + BOX.w / 2, y]}
          to={[TO + 40, y]}
          fill={member.latest.color}
          r={3.5}
        />
      ) : null}

      {member.findings !== null ? (
        <text
          x={W}
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
          d={`M${W - 16} ${y} l5 5 l10 -11`}
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-ok @max-lg:hidden"
        />
      ) : member.status === "failed" || member.status === "declined" ? (
        <path
          d={`M${W - 14} ${y - 6} l12 12 M${W - 2} ${y - 6} l-12 12`}
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          className="stroke-sev-critical @max-lg:hidden"
        />
      ) : null}
    </g>
  );
}

export function WindTunnel({
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
  return (
    <div className="@container">
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
          {crew.members.map((member, index) => (
            <Stream
              key={member.id}
              member={member}
              offset={offsetOf(index, crew.members.length)}
              outcome={crew.outcome}
              delay={index * 0.12}
            />
          ))}
        </svg>
        {/* The application, over the line that meets it head on. */}
        <AppStack
          subject={subject}
          workspaces={workspaces}
          reading={reading}
          live={live}
          outcome={crew.outcome}
        />
      </div>
      {/* On a narrow screen the drawing is too small to read: the same facts
        as a list under it. */}
      <ul className="hidden divide-y divide-border/60 @max-lg:block">
        {crew.members.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-3 py-2 text-[0.8125rem]"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                member.status === "running"
                  ? "bg-brand"
                  : member.status === "done"
                    ? "bg-ok"
                    : member.status === "pending"
                      ? "bg-muted-foreground/40"
                      : "bg-sev-critical",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block">{member.name}</span>
              {member.doing || member.note ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {member.status === "running" ? member.doing : member.note}
                </span>
              ) : null}
            </span>
            {member.findings !== null ? (
              <span className="font-mono text-sm tabular-nums">
                {member.findings}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
