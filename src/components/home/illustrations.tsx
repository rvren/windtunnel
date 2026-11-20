import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { RunKind } from "@/server/engine/schema";

/*
 * One small drawing for each kind of run, in the wind tunnel's own
 * language: fine violet lines on a faint tint of the card, with colour
 * only where it means something (red for what fails, green for what
 * holds). Each shows what the kind does in one glance: the input on the
 * left, the work in the middle, the result on the right. Flat and still:
 * a card answers the pointer with its colours, not with motion.
 *
 * The drawings share one 240 x 150 frame and one set of tones, set on the
 * wrapper (--il-line, --il-bg), so both themes read the same.
 */

const LINE = "stroke-[var(--il-line)]";
const SOFT = "stroke-foreground/35";
const PANEL = "fill-[var(--il-bg)]";
const OK = "stroke-ok";
const BAD = "stroke-sev-critical";
const WARN = "stroke-sev-high";

/** A flat diamond: one plate of the application, seen from above. */
const diamond = (cx: number, cy: number, w: number, h: number) =>
  `M${cx - w} ${cy} L${cx} ${cy - h} L${cx + w} ${cy} L${cx} ${cy + h} Z`;

/** A tick, centred on (cx, cy). */
const tick = (cx: number, cy: number, r = 2.6) =>
  `M${cx - r} ${cy} l${r * 0.8} ${r * 0.9} l${r * 1.4} ${-r * 1.7}`;

/** A cross, centred on (cx, cy). */
const cross = (cx: number, cy: number, r = 2.4) =>
  `M${cx - r} ${cy - r} L${cx + r} ${cy + r} M${cx + r} ${cy - r} L${cx - r} ${cy + r}`;

/** Tunnel Run: a fan, five streams, an application, and what turns up. */
function TunnelRun() {
  const rows = [47, 61, 75, 89, 103];
  const ends = [OK, BAD, OK, WARN, OK];
  const spokes = Array.from({ length: 12 }, (_, index) => {
    const a = (index / 12) * Math.PI * 2;
    const b = a + 0.55;
    return `M${44 + Math.cos(a) * 7} ${75 + Math.sin(a) * 7} Q${44 + Math.cos(a + 0.1) * 17} ${75 + Math.sin(a + 0.1) * 17} ${44 + Math.cos(b) * 23} ${75 + Math.sin(b) * 23}`;
  });
  return (
    <>
      {rows.map((y, index) => (
        <g key={y}>
          <line
            x1="64"
            y1={y}
            x2="205"
            y2={y}
            className={LINE}
            strokeOpacity="0.5"
            strokeWidth="1.25"
          />
          <circle
            cx="210"
            cy={y}
            r="3"
            className={cn("fill-[var(--il-bg)]", ends[index])}
            strokeWidth="1.5"
          />
        </g>
      ))}
      <circle
        cx="44"
        cy="75"
        r="29"
        className={cn("fill-none", LINE)}
        strokeWidth="1.5"
      />
      <circle
        cx="44"
        cy="75"
        r="7"
        className={cn("fill-none", LINE)}
        strokeWidth="1.25"
      />
      {spokes.map((d) => (
        <path
          key={d}
          d={d}
          className={cn("fill-none", LINE)}
          strokeOpacity="0.6"
          strokeWidth="1"
        />
      ))}
      {[52, 75, 98].map((y) => (
        <path
          key={y}
          d={diamond(128, y, 40, 11)}
          className={cn(PANEL, LINE)}
          fillOpacity="0.9"
          strokeWidth="1.25"
        />
      ))}
      <circle cx="118" cy="52" r="2.6" className="fill-sev-critical" />
      <circle cx="132" cy="49" r="2.6" className="fill-sev-high" />
      <circle cx="124" cy="75" r="2.6" className="fill-sev-critical" />
    </>
  );
}

/** Preflight: a spec's lines, each tied to the code that proves it. */
function Preflight() {
  const rows = [46, 66, 86, 106];
  const code = [42, 56, 70, 84, 98, 112];
  const widths = [46, 30, 54, 38, 48, 26];
  return (
    <>
      <rect
        x="24"
        y="26"
        width="84"
        height="98"
        rx="6"
        className={cn(PANEL, SOFT)}
        strokeWidth="1.25"
      />
      <rect
        x="134"
        y="26"
        width="84"
        height="98"
        rx="6"
        className={cn(PANEL, LINE)}
        strokeWidth="1.25"
      />
      {rows.map((y, index) => (
        <g key={y}>
          <circle
            cx="40"
            cy={y}
            r="6"
            className={cn("fill-none", index === 2 ? BAD : OK)}
            strokeWidth="1.25"
          />
          <path
            d={index === 2 ? cross(40, y) : tick(40, y)}
            className={cn("fill-none", index === 2 ? BAD : OK)}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="54"
            y1={y}
            x2={54 + [38, 30, 36, 24][index]}
            y2={y}
            className={SOFT}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      ))}
      {code.map((y, index) => (
        <line
          key={y}
          x1={144 + (index % 3) * 6}
          y1={y}
          x2={144 + (index % 3) * 6 + widths[index]}
          y2={y}
          className={LINE}
          strokeOpacity="0.55"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      {(
        [
          [46, 42],
          [66, 56],
          [106, 98],
        ] as const
      ).map(([from, to]) => (
        <path
          key={from}
          d={`M108 ${from} C121 ${from} 121 ${to} 134 ${to}`}
          className={cn("fill-none", OK)}
          strokeOpacity="0.8"
          strokeWidth="1.25"
        />
      ))}
      <path
        d="M108 86 H121"
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
        strokeDasharray="2 2.5"
      />
      <path
        d={cross(124, 86, 2.2)}
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </>
  );
}

/** Engine Out: one part is cut, and the failure runs on to the customer. */
function EngineOut() {
  const node = (x: number, y: number, tone: string, dashed = false) => (
    <rect
      x={x - 12}
      y={y - 9}
      width="24"
      height="18"
      rx="4"
      className={cn(PANEL, tone)}
      strokeWidth="1.25"
      strokeDasharray={dashed ? "3 2.5" : undefined}
    />
  );
  return (
    <>
      <circle
        cx="86"
        cy="75"
        r="26"
        className={cn("fill-none", BAD)}
        strokeOpacity="0.3"
        strokeWidth="1"
        strokeDasharray="1.5 3"
      />
      <path
        d="M40 75 H74"
        className={cn("fill-none", LINE)}
        strokeWidth="1.25"
      />
      {["M98 71 C118 71 120 46 138 46", "M98 79 C118 79 120 104 138 104"].map(
        (d) => (
          <path
            key={d}
            d={d}
            className={cn("fill-none", BAD)}
            strokeWidth="1.25"
            strokeDasharray="3 2.5"
          />
        ),
      )}
      <path
        d="M150 48 C176 52 178 66 192 72"
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
        strokeDasharray="3 2.5"
      />
      <path
        d="M150 102 C176 98 178 84 192 78"
        className={cn("fill-none", BAD)}
        strokeOpacity="0.5"
        strokeWidth="1.25"
        strokeDasharray="3 2.5"
      />
      {node(28, 75, LINE)}
      {node(86, 75, BAD, true)}
      {node(144, 46, BAD)}
      {node(144, 104, WARN)}
      <path
        d={cross(86, 75, 3.4)}
        className={cn("fill-none", BAD)}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle
        cx="204"
        cy="75"
        r="12"
        className={cn(PANEL, BAD)}
        strokeWidth="1.25"
      />
      <circle
        cx="204"
        cy="71"
        r="3.2"
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
      />
      <path
        d="M197.5 81 C198 76 210 76 210.5 81"
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </>
  );
}

/** Fly-off: three designs, a judge, and one that wins. */
function FlyOff() {
  const stack = (cx: number, win: boolean) =>
    [60, 74, 88].map((y) => (
      <path
        key={`${cx}-${y}`}
        d={diamond(cx, y + (win ? 2 : 6), win ? 38 : 30, win ? 11 : 8.5)}
        className={cn(PANEL, win ? LINE : SOFT)}
        fillOpacity="0.9"
        strokeWidth={win ? 1.5 : 1.1}
      />
    ));
  return (
    <>
      <path
        d="M26 118 H214"
        className={SOFT}
        strokeWidth="1"
        strokeOpacity="0.6"
      />
      {[44, 120, 196].map((x) => (
        <path key={x} d={`M${x} 114 V122`} className={SOFT} strokeWidth="1" />
      ))}
      {stack(44, false)}
      {stack(196, false)}
      {stack(120, true)}
      <path
        d="M104 40 L107 27 L114 34 L120 24 L126 34 L133 27 L136 40 Z"
        className={cn("fill-[var(--il-line)]/15", LINE)}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M104 44 H136" className={LINE} strokeWidth="1.25" />
      <path
        d="M60 52 C84 38 96 38 106 44 M180 52 C156 38 144 38 134 44"
        className={cn("fill-none", SOFT)}
        strokeWidth="1"
        strokeDasharray="2 3"
      />
    </>
  );
}

/** Crosswind: one change, and the services it reaches. */
function Crosswind() {
  const box = (x: number, y: number, tone: string) => (
    <rect
      key={`${x}-${y}`}
      x={x - 12}
      y={y - 8}
      width="24"
      height="16"
      rx="4"
      className={cn(PANEL, tone)}
      strokeWidth="1.25"
    />
  );
  const edges: [string, string][] = [
    ["M56 75 C70 75 74 46 86 46", BAD],
    ["M56 75 C70 75 74 104 86 104", LINE],
    ["M110 46 C126 46 126 30 140 30", BAD],
    ["M110 46 C126 46 126 75 140 75", BAD],
    ["M110 104 C126 104 126 75 140 75", LINE],
    ["M110 104 C126 104 126 120 140 120", OK],
    ["M164 75 H190", BAD],
  ];
  return (
    <>
      {edges.map(([d, tone]) => (
        <path
          key={d}
          d={d}
          className={cn("fill-none", tone)}
          strokeOpacity={tone === LINE ? 0.45 : 0.9}
          strokeWidth="1.25"
        />
      ))}
      <rect
        x="22"
        y="58"
        width="34"
        height="34"
        rx="6"
        className={cn("fill-[var(--il-line)]/15", LINE)}
        strokeWidth="1.5"
      />
      <path
        d="M33 69 H45 M39 63 V75"
        className={cn("fill-none", OK)}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M33 83 H45"
        className={cn("fill-none", BAD)}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {box(98, 46, BAD)}
      {box(98, 104, LINE)}
      {box(152, 30, BAD)}
      {box(152, 75, BAD)}
      {box(152, 120, OK)}
      {box(202, 75, BAD)}
      <path
        d={tick(152, 120, 2.8)}
        className={cn("fill-none", OK)}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** Black Box: an error in production, traced to a line, and fixed. */
function BlackBox() {
  return (
    <>
      <path
        d="M44 52 L66 64 V90 L44 102 L22 90 V64 Z M22 64 L44 76 L66 64 M44 76 V102"
        className={cn(PANEL, LINE)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M44 40 V28 M30 42 L22 34 M58 42 L66 34"
        className={cn("fill-none", BAD)}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M70 78 C84 78 92 66 112 66"
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
        strokeDasharray="3 2.5"
      />
      <rect
        x="112"
        y="26"
        width="106"
        height="62"
        rx="6"
        className={cn(PANEL, SOFT)}
        strokeWidth="1.25"
      />
      {[40, 52, 76].map((y, index) => (
        <line
          key={y}
          x1={122 + (index % 2) * 8}
          y1={y}
          x2={122 + (index % 2) * 8 + [58, 40, 50][index]}
          y2={y}
          className={SOFT}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      <rect
        x="118"
        y="58"
        width="94"
        height="12"
        rx="3"
        className="fill-sev-critical/15 stroke-sev-critical"
        strokeWidth="1"
      />
      <line
        x1="124"
        y1="64"
        x2="170"
        y2="64"
        className={BAD}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M165 88 V100"
        className={cn("fill-none", OK)}
        strokeWidth="1.25"
        strokeDasharray="2 2.5"
      />
      <rect
        x="112"
        y="100"
        width="106"
        height="28"
        rx="6"
        className="fill-ok/10 stroke-ok"
        strokeWidth="1.25"
      />
      <line
        x1="122"
        y1="114"
        x2="176"
        y2="114"
        className={OK}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="200"
        cy="114"
        r="7"
        className={cn(PANEL, OK)}
        strokeWidth="1.25"
      />
      <path
        d={tick(200, 114, 2.8)}
        className={cn("fill-none", OK)}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** Dogfight: attacks against a fix, round after round, until it holds. */
function Dogfight() {
  const head = (x: number, y: number, tone: string) => (
    <path
      d={`M${x - 6} ${y - 4} L${x} ${y} L${x - 6} ${y + 4}`}
      className={cn("fill-none", tone)}
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  return (
    <>
      <path
        d="M160 32 L196 45 V78 C196 99 180 112 160 121 C140 112 124 99 124 78 V45 Z"
        className="fill-[var(--il-line)]/10 stroke-[var(--il-line)]"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d={tick(160, 80, 8)}
        className={cn("fill-none", OK)}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 50 H118"
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
      />
      {head(118, 50, BAD)}
      <path
        d="M26 75 H116 L102 64"
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M26 100 H96"
        className={cn("fill-none", BAD)}
        strokeOpacity="0.6"
        strokeWidth="1.25"
        strokeDasharray="3 2.5"
      />
      <path
        d={cross(104, 100, 2.6)}
        className={cn("fill-none", BAD)}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {[50, 75, 100].map((y) => (
        <circle
          key={y}
          cx={24}
          cy={y}
          r="3"
          className="fill-sev-critical/20 stroke-sev-critical"
          strokeWidth="1.25"
        />
      ))}
      {[148, 160, 172].map((x, index) => (
        <circle
          key={x}
          cx={x}
          cy="136"
          r="3"
          className={cn(
            index < 2 ? "fill-[var(--il-line)]" : "fill-none",
            LINE,
          )}
          strokeWidth="1.25"
        />
      ))}
    </>
  );
}

const ART: Record<RunKind, () => ReactNode> = {
  audit: TunnelRun,
  preflight: Preflight,
  engineout: EngineOut,
  flyoff: FlyOff,
  crosswind: Crosswind,
  blackbox: BlackBox,
  dogfight: Dogfight,
};

/** A kind's drawing, on a faint area of its own. */
export function FeatureArt({
  kind,
  className,
}: {
  kind: RunKind;
  className?: string;
}) {
  const Drawing = ART[kind];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid place-items-center overflow-hidden rounded-tile ring-1 ring-foreground/[0.06]",
        // The same tint as the wind tunnel's own area.
        "bg-[var(--il-bg)] [--il-bg:color-mix(in_oklab,var(--brand)_5%,var(--card))]",
        "dark:[--il-bg:color-mix(in_oklab,var(--card)_86%,black)]",
        "[--il-line:var(--brand)] dark:[--il-line:#c9c2ff]",
        className,
      )}
      data-testid={`launcher-art-${kind}`}
    >
      <svg
        viewBox="0 0 240 150"
        className="h-full w-auto max-w-full"
        fill="none"
        role="presentation"
      >
        <Drawing />
      </svg>
    </div>
  );
}
