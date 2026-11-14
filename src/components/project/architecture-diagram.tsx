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

import { EASE } from "@/components/motion";
import { AgentIcon } from "@/components/run/badges";
import { Button } from "@/components/ui/button";
import { useWidth } from "@/hooks/use-width";
import type { AgentId } from "@/lib/agents";
import { layerComponents } from "@/lib/architecture-layout";
import { cn } from "@/lib/utils";
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
}: {
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
      className="relative"
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
        aria-pressed={onSelect ? active : undefined}
        title={component.description}
        data-testid="cockpit-component"
        data-component={component.id}
        className={cn(
          "size-full min-h-15 justify-start gap-3 bg-card px-3 py-2 text-left font-normal whitespace-normal transition-colors duration-300 hover:border-foreground/30 hover:bg-card disabled:opacity-100 dark:bg-card dark:hover:bg-card",
          active && "border-foreground/60",
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
            {kind.label}
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
}: {
  components: Cockpit["components"];
  connections: Cockpit["connections"];
  showWorkspace: boolean;
  selected?: string | null;
  /** Makes each part a filter. Left out while a run is in progress. */
  onSelect?: (id: string) => void;
  /** While a run is going: the agents reading each part. */
  agentsAt?: Record<string, AgentId[]>;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const byId = new Map(components.map((item) => [item.id, item]));
  const layers = layerComponents(components, connections);
  const callsOf = (id: string) =>
    connections
      .filter((connection) => connection.from === id)
      .map((connection) => byId.get(connection.to)?.name ?? connection.to);
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

  const labelled = connections.length <= 8;
  const lines = connections.flatMap((connection) => {
    const from = box.get(connection.from);
    const to = box.get(connection.to);
    if (!from || !to) return [];
    const lit = selected === connection.from || selected === connection.to;
    const midY = CARD_HEIGHT / 2;
    let d: string;
    let at: { x: number; y: number };
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
        anchor = "start";
      } else {
        // Further apart: around the left of the parts between them.
        const x = from.x;
        const y0 = from.y + midY;
        const y1 = to.y + midY;
        const out = x - MIN_COLUMN_GAP / 2;
        d = `M${x} ${y0}C${out} ${y0} ${out} ${y1} ${x} ${y1}`;
        at = { x: out + 2, y: (y0 + y1) / 2 };
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
    }
    return [{ ...connection, d, at, lit, anchor }];
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
                  className="fill-muted-foreground stroke-background font-mono text-[10px] [paint-order:stroke] [stroke-width:4px]"
                >
                  {line.label}
                </text>
              ) : null}
            </g>
          ))}
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
      </div>
    </div>
  );
}
