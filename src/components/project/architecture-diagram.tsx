"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Boxes,
  Cloud,
  Database,
  Library,
  ListOrdered,
  Monitor,
  Server,
  type LucideIcon,
} from "lucide-react";

import { DrawLine, EASE, PopIn, TravelDash } from "@/components/motion";
import { AgentIcon } from "@/components/run/badges";
import { Button } from "@/components/ui/button";
import { useWidth } from "@/hooks/use-width";
import type { AgentId } from "@/lib/agents";
import { layerComponents } from "@/lib/architecture-layout";
import { cn } from "@/lib/utils";
import {
  placedHops,
  routeAlong,
  type FlightPlan,
  type HopTone,
} from "@/lib/viz/flight-path";
import type { Severity } from "@/server/engine/schema";
import type { Cockpit, CockpitComponent } from "@/server/projects/cockpit";

/*
 * The application as the run read it: callers on the left, what they call
 * to the right, data and outside systems last, joined by what calls what.
 * Each part carries its count of issues. A part is a button: it filters the
 * list of issues. While a run is going, the agents sit on the part they are
 * reading. On a narrow screen the lines are dropped and each part lists
 * what it calls.
 */

const KIND: Record<
  CockpitComponent["kind"],
  { label: string; icon: LucideIcon }
> = {
  frontend: { label: "Frontend", icon: Monitor },
  service: { label: "Service", icon: Server },
  library: { label: "Library", icon: Library },
  other: { label: "Other", icon: Boxes },
  database: { label: "Database", icon: Database },
  queue: { label: "Queue", icon: ListOrdered },
  external: { label: "Outside system", icon: Cloud },
};

const DOT: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
};

const SEVERITY_VAR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

/** A flight path's colours, by what a hop means. */
export const HOP_TONE: Record<HopTone, string> = {
  danger: "var(--sev-critical)",
  warning: "var(--sev-high)",
  ok: "var(--ok)",
  accent: "var(--brand)",
};

/** Seconds between one hop of a flight path and the next as it draws. */
const HOP_STEP = 0.55;
/** Seconds the travelling light takes over one hop. */
const HOP_TRIP = 1.1;

const CARD_HEIGHT = 60;
const ROW_GAP = 18;
const MIN_COLUMN_GAP = 40;
const MIN_CARD = 176;
const glide = { duration: 0.6, ease: EASE };

/** The small tile that stands for an agent. It glides to where the agent is. */
export function AgentMarker({
  agentId,
  className,
}: {
  agentId: AgentId;
  className?: string;
}) {
  return (
    <motion.span
      layoutId={`agent-${agentId}`}
      transition={glide}
      data-testid="live-agent"
      data-agent={agentId}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md bg-foreground text-background",
        className,
      )}
    >
      <AgentIcon agentId={agentId} className="size-3" />
    </motion.span>
  );
}

function Part({
  component,
  showWorkspace,
  active,
  onSelect,
  calls,
  agents = [],
  compact = false,
  style,
  mark,
  cut = false,
}: {
  /** A colour to edge the card with: what a change did to this part. */
  mark?: string;
  /** Taken away on purpose (Engine Out): drawn dashed and faded. */
  cut?: boolean;
  /** A narrow card: the kind's icon is left out to give the name room. */
  compact?: boolean;
  component: CockpitComponent;
  showWorkspace: boolean;
  active: boolean;
  onSelect?: () => void;
  /** Listed under the name when no lines are drawn. */
  calls?: string[];
  /** The agents reading this part right now. */
  agents?: AgentId[];
  style?: React.CSSProperties;
}) {
  const kind = KIND[component.kind];
  const reduced = useReducedMotion();
  return (
    <motion.div
      layout
      layoutId={`part-${component.id}`}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={glide}
      style={style}
      className={cn("relative", cut && "opacity-60")}
      data-cut={cut || undefined}
    >
      {/* A finding has just landed here: one soft ring in its colour. */}
      {component.worst && component.issues > 0 && !reduced ? (
        <motion.span
          key={component.issues}
          aria-hidden="true"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: EASE }}
          style={{ boxShadow: `0 0 0 2px ${SEVERITY_VAR[component.worst]}` }}
          className="pointer-events-none absolute inset-0 rounded-md"
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={onSelect}
        disabled={!onSelect}
        style={
          mark
            ? { borderColor: mark, boxShadow: `inset 3px 0 0 ${mark}` }
            : undefined
        }
        aria-pressed={onSelect ? active : undefined}
        title={component.description}
        data-testid="cockpit-component"
        data-component={component.id}
        className={cn(
          "size-full min-h-15 justify-start gap-3 bg-card px-3 py-2 text-left font-normal whitespace-normal transition-colors duration-300 hover:border-foreground/30 hover:bg-card disabled:opacity-100 dark:bg-card dark:hover:bg-card",
          active && "border-foreground/60",
          cut && "border-dashed border-sev-critical",
        )}
      >
        {compact ? null : (
          <kind.icon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {component.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {cut ? "Cut off" : kind.label}
            {showWorkspace && component.workspace
              ? ` · ${component.workspace}`
              : ""}
          </span>
          {calls && calls.length > 0 ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              Calls {calls.join(", ")}
            </span>
          ) : null}
        </span>
        {component.worst ? (
          <span
            className="flex items-center gap-1.5 font-mono text-xs"
            aria-label={`${component.issues} issues`}
          >
            <span
              className={cn("size-1.5 rounded-full", DOT[component.worst])}
            />
            {component.issues}
          </span>
        ) : null}
      </Button>
      {agents.length > 0 ? (
        <span className="absolute -top-2.5 right-2.5 flex gap-1">
          {agents.map((agentId) => (
            <AgentMarker key={agentId} agentId={agentId} />
          ))}
        </span>
      ) : null}
    </motion.div>
  );
}

/** A line of the diagram: it draws itself, then carries a slow dash. */
function Line({
  d,
  lit,
  dim,
  index,
}: {
  d: string;
  lit: boolean;
  dim: boolean;
  index: number;
}) {
  const reduced = useReducedMotion();
  return (
    <g
      className={cn(
        "transition-opacity duration-500",
        lit ? "opacity-100" : dim ? "opacity-15" : "opacity-45",
      )}
    >
      <motion.path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        markerEnd="url(#architecture-arrow)"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.25 + index * 0.05 }}
      />
      {reduced ? null : (
        <motion.path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          pathLength={1000}
          strokeDasharray="36 964"
          initial={{ strokeDashoffset: 0, opacity: 0 }}
          animate={{ strokeDashoffset: -1000, opacity: 0.9 }}
          transition={{
            strokeDashoffset: {
              duration: 3.6,
              ease: "linear",
              repeat: Infinity,
              delay: 1.2 + (index % 5) * 0.55,
            },
            opacity: { duration: 0.8, delay: 1.2 + (index % 5) * 0.55 },
          }}
        />
      )}
    </g>
  );
}

export function ArchitectureDiagram({
  components,
  connections,
  showWorkspace,
  selected = null,
  onSelect,
  agentsAt,
  marks,
  flight,
}: {
  components: Cockpit["components"];
  connections: Cockpit["connections"];
  /** Colours to edge parts with, by id (a Crosswind run's changes). */
  marks?: Record<string, string>;
  showWorkspace: boolean;
  selected?: string | null;
  /** Makes each part a filter. Left out while a run is in progress. */
  onSelect?: (id: string) => void;
  /** While a run is going: the agents reading each part. */
  agentsAt?: Record<string, AgentId[]>;
  /**
   * A route to draw over the map, hop by hop. A new `play` number draws it
   * again from the start; a stop on the map selects its hop.
   */
  flight?: {
    plan: FlightPlan;
    play?: number;
    selected?: string | null;
    onHop?: (id: string) => void;
  };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const byId = new Map(components.map((item) => [item.id, item]));
  const layers = layerComponents(components, connections);
  const callsOf = (id: string) =>
    connections
      .filter((connection) => connection.from === id)
      .map((connection) => byId.get(connection.to)?.name ?? connection.to);
  const cutParts = new Set(flight?.plan.cut ?? []);
  // A part on the route is edged in the colour of the first hop to reach it.
  const flightMarks = new Map<string, string>();
  for (const hop of flight?.plan.hops ?? []) {
    for (const id of [hop.from, hop.to]) {
      if (!flightMarks.has(id) && !cutParts.has(id)) {
        flightMarks.set(id, HOP_TONE[hop.tone]);
      }
    }
  }
  const part = (
    id: string,
    extra?: Partial<React.ComponentProps<typeof Part>>,
  ) => {
    const component = byId.get(id)!;
    return (
      <Part
        key={id}
        component={component}
        showWorkspace={showWorkspace}
        active={selected === id}
        onSelect={onSelect ? () => onSelect(id) : undefined}
        agents={agentsAt?.[id]}
        mark={marks?.[id] ?? flightMarks.get(id)}
        cut={cutParts.has(id)}
        {...extra}
      />
    );
  };

  const columns = Math.max(layers.length, 1);
  // The diagram keeps a width its cards can be read at. When the page is
  // narrower it scrolls sideways inside its panel; on a phone it is a list.
  const canvas = Math.max(
    width,
    columns * MIN_CARD + MIN_COLUMN_GAP * (columns - 1),
  );
  const cardWidth = Math.min(
    232,
    (canvas - MIN_COLUMN_GAP * (columns - 1)) / columns,
  );
  if (width === 0 || width < 520) {
    return (
      <div
        ref={ref}
        className="grid gap-3"
        data-testid="cockpit-architecture"
        data-layout="list"
      >
        {width > 0
          ? layers.flat().map((id) => part(id, { calls: callsOf(id) }))
          : null}
      </div>
    );
  }

  const rows = Math.max(...layers.map((layer) => layer.length), 1);
  const height = rows * CARD_HEIGHT + (rows - 1) * ROW_GAP;
  const step = columns > 1 ? (canvas - cardWidth) / (columns - 1) : 0;
  const box = new Map<
    string,
    { x: number; y: number; layer: number; row: number }
  >();
  layers.forEach((layer, index) => {
    const used = layer.length * CARD_HEIGHT + (layer.length - 1) * ROW_GAP;
    layer.forEach((id, row) => {
      box.set(id, {
        x: columns > 1 ? index * step : (canvas - cardWidth) / 2,
        y: (height - used) / 2 + row * (CARD_HEIGHT + ROW_GAP),
        layer: index,
        row,
      });
    });
  });

  type Box = { x: number; y: number; layer: number; row: number };
  /** The line from one part to another, with its middle and label spot. */
  const route = (from: Box, to: Box) => {
    const midY = CARD_HEIGHT / 2;
    let d: string;
    let at: { x: number; y: number };
    let middle: { x: number; y: number };
    let anchor: "start" | "middle" | "end" = "middle";
    if (from.layer === to.layer) {
      const up = to.y < from.y;
      if (Math.abs(to.row - from.row) === 1) {
        // Neighbours in one column: a short line down their middle.
        const x = from.x + cardWidth / 2;
        const y0 = up ? from.y : from.y + CARD_HEIGHT;
        const y1 = up ? to.y + CARD_HEIGHT : to.y;
        d = `M${x} ${y0}L${x} ${y1}`;
        at = { x: x + 8, y: (y0 + y1) / 2 };
        middle = { x, y: (y0 + y1) / 2 };
        anchor = "start";
      } else {
        // Further apart: around the left of the parts between them.
        const x = from.x;
        const y0 = from.y + midY;
        const y1 = to.y + midY;
        const out = x - MIN_COLUMN_GAP / 2;
        d = `M${x} ${y0}C${out} ${y0} ${out} ${y1} ${x} ${y1}`;
        at = { x: out + 2, y: (y0 + y1) / 2 };
        middle = { x: 0.25 * x + 0.75 * out, y: (y0 + y1) / 2 };
        anchor = "end";
      }
    } else {
      const forward = to.layer > from.layer;
      const x0 = forward ? from.x + cardWidth : from.x;
      const x1 = forward ? to.x : to.x + cardWidth;
      const y0 = from.y + midY;
      const y1 = to.y + midY;
      const mid = (x0 + x1) / 2;
      d = `M${x0} ${y0}C${mid} ${y0} ${mid} ${y1} ${x1} ${y1}`;
      at = { x: (x0 * 2 + x1) / 3, y: (y0 * 2 + y1) / 3 - 7 };
      middle = { x: mid, y: (y0 + y1) / 2 };
    }
    return { d, at, anchor, middle };
  };

  const labelled = connections.length <= 8;
  const lines = connections.flatMap((connection) => {
    const from = box.get(connection.from);
    const to = box.get(connection.to);
    if (!from || !to) return [];
    const lit = selected === connection.from || selected === connection.to;
    return [{ ...connection, ...route(from, to), lit }];
  });

  // The flight path: a line per hop between two parts, following the calls
  // (under the parts it passes), drawn one after another; then a light that
  // travels the hops in order. Each stop's number sits on the top edge of
  // the part the hop arrives at, where its step is.
  const hops = flight ? placedHops(flight.plan, box.keys()) : [];
  const legs = hops.filter((hop) => hop.from !== hop.to);
  const tour = legs.length * HOP_TRIP + 1.4;
  const legPath = (hop: (typeof hops)[number]) => {
    const ids = routeAlong(hop.from, hop.to, connections).filter((id) =>
      box.has(id),
    );
    return ids
      .slice(1)
      .map((id, index) => {
        const { d } = route(box.get(ids[index])!, box.get(id)!);
        // Each piece carries on from the last: across a part, under its card.
        return index === 0 ? d : d.replace(/^M/, "L");
      })
      .join(" ");
  };
  const onCard = new Map<string, number>();
  const stops = hops.map((hop, index) => {
    const at = box.get(hop.to)!;
    const seat = onCard.get(hop.to) ?? 0;
    onCard.set(hop.to, seat + 1);
    return {
      hop,
      delay: 0.3 + index * HOP_STEP,
      x: at.x + 18 + seat * 24,
      y: at.y,
    };
  });

  return (
    <div
      ref={ref}
      // Room above for the agents' markers, which sit on a card's top edge.
      className="overflow-x-auto pt-3"
      data-testid="cockpit-architecture"
      data-layout="diagram"
    >
      <div className="relative" style={{ width: canvas, height }}>
        <svg
          width={canvas}
          height={height}
          className="absolute inset-0 overflow-visible text-foreground"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="architecture-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M1 1L7 4L1 7" fill="none" stroke="currentColor" />
            </marker>
          </defs>
          {lines.map((line, index) => (
            <g key={`${line.from}>${line.to}`}>
              <Line
                d={line.d}
                lit={line.lit}
                dim={selected !== null && !line.lit}
                index={index}
              />
              {labelled || line.lit ? (
                <text
                  x={line.at.x}
                  y={line.at.y}
                  textAnchor={line.anchor}
                  dominantBaseline="central"
                  className="fill-muted-foreground stroke-background font-mono text-[0.625rem] [paint-order:stroke] [stroke-width:4px]"
                >
                  {line.label}
                </text>
              ) : null}
            </g>
          ))}
          {flight ? (
            <g key={`flight-${flight.play ?? 0}`} data-testid="flight-path">
              {legs.map((hop, index) => {
                const d = legPath(hop);
                const stroke = HOP_TONE[hop.tone];
                const start = 0.3 + hops.indexOf(hop) * HOP_STEP;
                return (
                  <g key={hop.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={1.25}
                      strokeDasharray="3 4"
                      opacity={0.45}
                    />
                    <DrawLine
                      d={d}
                      stroke={stroke}
                      width={flight.selected === hop.id ? 3 : 2}
                      delay={start}
                    />
                    <TravelDash
                      d={d}
                      stroke={stroke}
                      duration={HOP_TRIP}
                      delay={
                        0.3 + hops.length * HOP_STEP + 0.6 + index * HOP_TRIP
                      }
                      every={tour}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}
        </svg>
        {layers.flat().map((id) => {
          const at = box.get(id)!;
          return part(id, {
            compact: cardWidth < 200,
            style: {
              position: "absolute",
              left: at.x,
              top: at.y,
              width: cardWidth,
              height: CARD_HEIGHT,
            },
          });
        })}
        {flight ? (
          <div key={`stops-${flight.play ?? 0}`}>
            {stops.map(({ hop, delay, x, y }) => (
              <PopIn
                key={hop.id}
                delay={delay}
                className="absolute z-10"
                style={{
                  left: `calc(${x}px - 0.75rem)`,
                  top: `calc(${y}px - 0.75rem)`,
                }}
              >
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  onClick={
                    flight.onHop ? () => flight.onHop!(hop.id) : undefined
                  }
                  aria-pressed={
                    flight.onHop ? flight.selected === hop.id : undefined
                  }
                  aria-label={`Step ${hop.number}: ${hop.label}`}
                  title={hop.label}
                  data-testid="flight-stop"
                  data-hop={hop.id}
                  style={{
                    borderColor: HOP_TONE[hop.tone],
                    color: HOP_TONE[hop.tone],
                  }}
                  className={cn(
                    "rounded-full bg-card font-mono text-[0.6875rem] hover:bg-card dark:bg-card",
                    flight.selected === hop.id && "ring-2 ring-current/30",
                  )}
                >
                  {hop.number}
                </Button>
              </PopIn>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
