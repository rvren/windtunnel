"use client";

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

import { Button } from "@/components/ui/button";
import { useWidth } from "@/hooks/use-width";
import { cn } from "@/lib/utils";
import type { Severity } from "@/server/engine/schema";
import type { Cockpit, CockpitComponent } from "@/server/projects/cockpit";

/*
 * The application as the run read it: frontends on the left, services in
 * the middle, data and outside systems on the right, joined by what calls
 * what. Each part carries its count of issues. A part is a button: it
 * filters the list of issues. On a narrow screen the lines are dropped and
 * each part lists what it calls.
 */

const KIND: Record<
  CockpitComponent["kind"],
  { label: string; icon: LucideIcon; layer: 0 | 1 | 2 }
> = {
  frontend: { label: "Frontend", icon: Monitor, layer: 0 },
  service: { label: "Service", icon: Server, layer: 1 },
  library: { label: "Library", icon: Library, layer: 1 },
  other: { label: "Other", icon: Boxes, layer: 1 },
  database: { label: "Database", icon: Database, layer: 2 },
  queue: { label: "Queue", icon: ListOrdered, layer: 2 },
  external: { label: "Outside system", icon: Cloud, layer: 2 },
};

const DOT: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
};

const CARD_HEIGHT = 64;
const GAP = 20;

function Part({
  component,
  showWorkspace,
  active,
  onSelect,
  calls,
  style,
}: {
  component: CockpitComponent;
  showWorkspace: boolean;
  active: boolean;
  onSelect: () => void;
  /** Listed under the name when no lines are drawn. */
  calls?: string[];
  style?: React.CSSProperties;
}) {
  const kind = KIND[component.kind];
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onSelect}
      aria-pressed={active}
      title={component.description}
      data-testid="cockpit-component"
      data-component={component.id}
      style={style}
      className={cn(
        "h-auto min-h-16 justify-start gap-3 bg-card px-3 py-2 text-left font-normal whitespace-normal transition-colors duration-300 hover:border-foreground/30 hover:bg-card dark:bg-card dark:hover:bg-card",
        active && "border-foreground/60",
      )}
    >
      <kind.icon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
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
          <span className={cn("size-1.5 rounded-full", DOT[component.worst])} />
          {component.issues}
        </span>
      ) : null}
    </Button>
  );
}

export function ArchitectureDiagram({
  components,
  connections,
  showWorkspace,
  selected,
  onSelect,
}: {
  components: Cockpit["components"];
  connections: Cockpit["connections"];
  showWorkspace: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const layers = [0, 1, 2]
    .map((layer) =>
      components.filter((item) => KIND[item.kind].layer === layer),
    )
    .filter((layer) => layer.length > 0);
  const nameOf = new Map(components.map((item) => [item.id, item.name]));
  const callsOf = (id: string) =>
    connections
      .filter((connection) => connection.from === id)
      .map((connection) => nameOf.get(connection.to) ?? connection.to);

  // Narrow, or not measured yet: a plain list, layer by layer.
  const cardWidth = Math.min(
    240,
    (width - GAP * 4 * (layers.length - 1)) / layers.length,
  );
  if (width === 0 || cardWidth < 170) {
    return (
      <div
        ref={ref}
        className="grid gap-2"
        data-testid="cockpit-architecture"
        data-layout="list"
      >
        {width > 0
          ? layers
              .flat()
              .map((component) => (
                <Part
                  key={component.id}
                  component={component}
                  showWorkspace={showWorkspace}
                  active={selected === component.id}
                  onSelect={() => onSelect(component.id)}
                  calls={callsOf(component.id)}
                />
              ))
          : null}
      </div>
    );
  }

  const rows = Math.max(...layers.map((layer) => layer.length));
  const height = rows * CARD_HEIGHT + (rows - 1) * GAP;
  const step =
    layers.length > 1 ? (width - cardWidth) / (layers.length - 1) : 0;
  const box = new Map<
    string,
    { x: number; y: number; layer: number; row: number }
  >();
  layers.forEach((layer, index) => {
    const used = layer.length * CARD_HEIGHT + (layer.length - 1) * GAP;
    layer.forEach((component, row) => {
      box.set(component.id, {
        x: layers.length > 1 ? index * step : (width - cardWidth) / 2,
        y: (height - used) / 2 + row * (CARD_HEIGHT + GAP),
        layer: index,
        row,
      });
    });
  });

  const lines = connections.flatMap((connection) => {
    const from = box.get(connection.from);
    const to = box.get(connection.to);
    if (!from || !to) return [];
    const lit = selected === connection.from || selected === connection.to;
    const midY = CARD_HEIGHT / 2;
    let d: string;
    let at: { x: number; y: number };
    if (from.layer === to.layer) {
      const up = to.y < from.y;
      if (Math.abs(to.row - from.row) === 1) {
        // Neighbours in one layer: a short line down their middle.
        const x = from.x + cardWidth / 2;
        const y0 = up ? from.y : from.y + CARD_HEIGHT;
        const y1 = up ? to.y + CARD_HEIGHT : to.y;
        d = `M${x} ${y0}L${x} ${y1}`;
        at = { x: x + 8, y: (y0 + y1) / 2 };
      } else {
        // Further apart: around the left of the parts between them.
        const x = from.x;
        const y0 = from.y + midY;
        const y1 = to.y + midY;
        const out = x - GAP * 1.5;
        d = `M${x} ${y0}C${out} ${y0} ${out} ${y1} ${x} ${y1}`;
        at = { x: out + 2, y: (y0 + y1) / 2 };
      }
    } else {
      const forward = to.layer > from.layer;
      const x0 = forward ? from.x + cardWidth : from.x;
      const x1 = forward ? to.x : to.x + cardWidth;
      const y0 = from.y + midY;
      const y1 = to.y + midY;
      const mid = (x0 + x1) / 2;
      d = `M${x0} ${y0}C${mid} ${y0} ${mid} ${y1} ${x1} ${y1}`;
      at = { x: mid, y: (y0 + y1) / 2 - 6 };
    }
    const anchor =
      from.layer !== to.layer
        ? ("middle" as const)
        : Math.abs(to.row - from.row) === 1
          ? ("start" as const)
          : ("end" as const);
    return [{ ...connection, d, at, lit, anchor }];
  });

  return (
    <div
      ref={ref}
      className="relative"
      style={{ height }}
      data-testid="cockpit-architecture"
      data-layout="diagram"
    >
      <svg
        width={width}
        height={height}
        className="absolute inset-0 text-foreground"
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
        {lines.map((line) => (
          <g
            key={`${line.from}>${line.to}`}
            className={cn(
              "transition-opacity duration-300",
              line.lit ? "opacity-90" : "opacity-35",
            )}
          >
            <path
              d={line.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              markerEnd="url(#architecture-arrow)"
            />
            <text
              x={line.at.x}
              y={line.at.y}
              textAnchor={line.anchor}
              dominantBaseline="central"
              className="fill-current font-mono text-[10px] [paint-order:stroke] stroke-background [stroke-width:4px]"
            >
              {line.label}
            </text>
          </g>
        ))}
      </svg>
      {layers.flat().map((component) => {
        const at = box.get(component.id)!;
        return (
          <Part
            key={component.id}
            component={component}
            showWorkspace={showWorkspace}
            active={selected === component.id}
            onSelect={() => onSelect(component.id)}
            style={{
              position: "absolute",
              left: at.x,
              top: at.y,
              width: cardWidth,
              height: CARD_HEIGHT,
            }}
          />
        );
      })}
    </div>
  );
}
