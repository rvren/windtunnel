"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";

import { EASE } from "@/components/motion";
import { useWidth } from "@/hooks/use-width";
import { NODE_WIDTH, layoutFlow } from "@/lib/sankey-layout";
import { cn } from "@/lib/utils";
import type {
  FlowFilter,
  FlowGroup,
  FlowNodeData,
  FlowView,
} from "@/lib/viz/cockpit-views";

/*
 * The cockpit's canvas: sources on the left as ringed circles, hubs in the
 * middle with a ring of ticks, groups on the right with a few items each.
 * Bands are bundles of thin strands in their colour. The SVG draws bands
 * and rings; the words are HTML on top, so they wrap, link and read well.
 * Below 768px it is three plain lists.
 */

const LEFT = 96;
const RIGHT_ROOM = 268;
const TOP = 34;
const SOURCE_R = 32;
const HUB_R = 34;
const TICKS = 44;
// Room per row: roomier with few nodes, tighter when a column has many.
const rowFor = (rows: number) => (rows > 4 ? 118 : 170);

interface Props {
  view: FlowView;
  /** Node ids that filter the list now. */
  selected: string[];
  onPick: (filter: FlowFilter) => void;
}

function Ticks({ cx, cy, tone }: { cx: number; cy: number; tone: string }) {
  return (
    <g aria-hidden="true">
      {Array.from({ length: TICKS }, (_, index) => {
        const angle = (index / TICKS) * Math.PI * 2;
        const inner = HUB_R + 6;
        const outer = HUB_R + (index % 4 === 0 ? 14 : 10);
        return (
          <line
            key={index}
            x1={cx + Math.cos(angle) * inner}
            y1={cy + Math.sin(angle) * inner}
            x2={cx + Math.cos(angle) * outer}
            y2={cy + Math.sin(angle) * outer}
            stroke={tone}
            strokeOpacity={index % 4 === 0 ? 0.9 : 0.45}
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

function StackedLists({ view, selected, onPick }: Props) {
  const column = (title: string, nodes: (FlowNodeData | FlowGroup)[]) => (
    <section>
      <h3 className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              disabled={!node.filter}
              onClick={() => node.filter && onPick(node.filter)}
              aria-pressed={selected.includes(node.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-tile bg-surface-inset px-3 py-2 text-left text-sm",
                selected.includes(node.id) && "ring-1 ring-brand",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: node.tone ?? "var(--brand)" }}
              />
              <span className="min-w-0 flex-1 truncate">{node.label}</span>
              <span className="font-mono text-xs tabular-nums">
                {node.value}
              </span>
            </button>
            {"leaves" in node && node.leaves.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pl-5 text-xs text-muted-foreground">
                {node.leaves.map((leaf) => (
                  <li key={leaf.id} className="truncate">
                    {leaf.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="grid gap-5" data-testid="flow-canvas-lists">
      {column(view.heading[0], view.sources)}
      {column(view.heading[1], view.hubs)}
      {column(view.heading[2], view.groups)}
    </div>
  );
}

export function FlowCanvas(props: Props) {
  const { view, selected, onPick } = props;
  const reduced = useReducedMotion();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);

  const rows = Math.max(
    view.sources.length,
    view.hubs.length,
    view.groups.length,
    1,
  );
  const height = Math.max(380, rows * rowFor(rows));
  const groupX = width - RIGHT_ROOM;
  const layout = layoutFlow(
    [
      ...view.sources.map((n) => ({ id: n.id, column: 0, value: n.value })),
      ...view.hubs.map((n) => ({ id: n.id, column: 1, value: n.value })),
      ...view.groups.map((n) => ({ id: n.id, column: 2, value: n.value })),
    ],
    view.bands,
    {
      width: Math.max(groupX - LEFT, 200),
      height,
      gap: 150,
      // Sources and groups can be many; hubs need room for their labels.
      gaps: [
        view.sources.length > 4 ? 100 : 150,
        150,
        view.groups.length > 4 ? 104 : 150,
      ],
      // A node's bands fit inside its ring.
      maxScale:
        (HUB_R * 1.6) /
        Math.max(
          1,
          ...[...view.sources, ...view.hubs, ...view.groups].map(
            (n) => n.value,
          ),
        ),
    },
  );
  const placed = new Map(layout.nodes.map((node) => [node.id, node]));
  const centre = (id: string) => {
    const node = placed.get(id);
    return node
      ? {
          x: LEFT + node.x + NODE_WIDTH / 2,
          y: TOP + node.y + node.height / 2,
        }
      : { x: 0, y: 0 };
  };

  // What is lit: the hovered node, else what filters the list.
  const lit = hovered ? [hovered] : selected;
  const touches = (band: { source: string; target: string }) =>
    lit.length === 0 || lit.includes(band.source) || lit.includes(band.target);
  const pickable = (node: FlowNodeData) =>
    node.filter
      ? {
          role: "button" as const,
          tabIndex: 0,
          "aria-pressed": selected.includes(node.id),
          onClick: () => onPick(node.filter!),
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onPick(node.filter!);
            }
          },
        }
      : {};
  const hover = (id: string) => ({
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(id),
    onBlur: () => setHovered(null),
  });

  return (
    <div ref={ref} data-testid="flow-canvas">
      {width === 0 ? (
        <div style={{ height: height + TOP }} />
      ) : width < 768 ? (
        <StackedLists {...props} />
      ) : (
        <div className="relative" style={{ height: height + TOP + 24 }}>
          {/* Column headings */}
          {[LEFT, LEFT + (groupX - LEFT) / 2, groupX].map((x, index) => (
            <p
              key={view.heading[index]}
              className="absolute top-0 -translate-x-1/2 text-[11px] tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase"
              style={{ left: index === 2 ? x + 60 : x }}
            >
              {view.heading[index]}
            </p>
          ))}

          <svg
            width={width}
            height={height + TOP + 24}
            className="absolute inset-0 overflow-visible"
            role="img"
            aria-label={`${view.heading.join(" to ")}`}
          >
            {/* Bands, as bundles of strands */}
            <g transform={`translate(${LEFT} ${TOP})`}>
              {layout.links.map((link, index) => {
                const tone = link.tone;
                const on = touches(link);
                const strands = Math.max(
                  1,
                  Math.min(3, Math.round(link.thickness / 4)),
                );
                const mid = (link.x0 + link.x1) / 2;
                return (
                  <g
                    key={`${link.source}>${link.target}>${tone}>${index}`}
                    className={cn(
                      "transition-opacity duration-300",
                      on && lit.length > 0 && "glow",
                    )}
                    opacity={on ? 1 : 0.12}
                  >
                    {Array.from({ length: strands }, (_, strand) => {
                      const offset =
                        (link.thickness * (strand + 0.5)) / strands;
                      const a = link.y0 + offset;
                      const b = link.y1 + offset;
                      return (
                        <motion.path
                          key={strand}
                          d={`M${link.x0} ${a}C${mid} ${a} ${mid} ${b} ${link.x1} ${b}`}
                          fill="none"
                          stroke={tone}
                          style={{ strokeOpacity: "var(--strand-opacity)" }}
                          strokeWidth={Math.min(
                            2.25,
                            Math.max(1, (link.thickness / strands) * 0.5),
                          )}
                          strokeLinecap="round"
                          initial={reduced ? false : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{
                            duration: 0.9,
                            ease: EASE,
                            delay: 0.05 * (index % 12),
                          }}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>

            {/* Sources: ringed circles */}
            {view.sources.map((node) => {
              const { x, y } = centre(node.id);
              const on = lit.includes(node.id);
              return (
                <g key={node.id} className={cn(on && "glow")}>
                  <circle
                    cx={x}
                    cy={y}
                    r={SOURCE_R + 9}
                    fill="none"
                    stroke="var(--canvas-ring)"
                    strokeDasharray="2 5"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={SOURCE_R}
                    fill="var(--canvas-node)"
                    stroke={on ? "var(--brand)" : "var(--canvas-ring)"}
                    strokeWidth={on ? 1.5 : 1}
                  />
                </g>
              );
            })}

            {/* Hubs: a ring of ticks */}
            {view.hubs.map((node) => {
              const { x, y } = centre(node.id);
              const on = lit.includes(node.id);
              const tone = node.tone ?? "var(--brand)";
              return (
                <g key={node.id} className={cn("glow-soft", on && "glow")}>
                  <Ticks cx={x} cy={y} tone={tone} />
                  <circle
                    cx={x}
                    cy={y}
                    r={HUB_R}
                    fill="var(--canvas-node)"
                    stroke={on ? tone : "var(--canvas-ring)"}
                  />
                </g>
              );
            })}

            {/* Groups: a dot where the bands land */}
            {view.groups.map((node) => {
              const { x, y } = centre(node.id);
              return (
                <circle
                  key={node.id}
                  cx={x}
                  cy={y}
                  r={5}
                  fill={node.tone ?? "var(--brand)"}
                  className={cn(lit.includes(node.id) && "glow")}
                />
              );
            })}
          </svg>

          {/* Words on top */}
          {view.sources.map((node) => {
            const { x, y } = centre(node.id);
            return (
              <div
                key={node.id}
                {...pickable(node)}
                {...hover(node.id)}
                data-testid="flow-source"
                className="absolute flex w-36 -translate-x-1/2 flex-col items-center text-center outline-none focus-visible:outline-2 focus-visible:outline-ring"
                style={{ left: x, top: y - SOURCE_R }}
              >
                <span className="flex h-16 items-center text-xl font-light tabular-nums">
                  {node.value}
                </span>
                <span className="mt-3 line-clamp-2 max-w-full rounded-sm bg-canvas/85 px-1.5 text-[11px] tracking-[0.1em] uppercase">
                  {node.label}
                </span>
                {node.sub ? (
                  <span className="text-[11px] text-muted-foreground">
                    {node.sub}
                  </span>
                ) : null}
              </div>
            );
          })}
          {view.hubs.map((node) => {
            const { x, y } = centre(node.id);
            return (
              <div
                key={node.id}
                {...pickable(node)}
                {...hover(node.id)}
                data-testid="flow-hub"
                className="absolute flex w-44 -translate-x-1/2 flex-col items-center text-center outline-none focus-visible:outline-2 focus-visible:outline-ring"
                style={{ left: x, top: y - HUB_R }}
              >
                <span className="flex h-[68px] items-center text-2xl font-light tabular-nums">
                  {node.value}
                </span>
                <span className="mt-4 rounded-sm bg-canvas/85 px-1.5 text-sm font-medium">
                  {node.label}
                </span>
                {node.sub ? (
                  <span className="text-[11px] text-muted-foreground">
                    {node.sub}
                  </span>
                ) : null}
              </div>
            );
          })}
          {view.groups.map((node) => {
            const { x, y } = centre(node.id);
            return (
              <div
                key={node.id}
                {...hover(node.id)}
                data-testid="flow-group"
                className="absolute w-[244px]"
                style={{ left: x + 14, top: y - 11 }}
              >
                <div
                  {...pickable(node)}
                  className="flex items-baseline gap-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="text-lg leading-none font-light tabular-nums">
                    {node.value}
                  </span>
                  <span className="text-[11px] tracking-[0.1em] uppercase">
                    {node.label}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {node.leaves.map((leaf) => {
                    const body = (
                      <>
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: leaf.tone ?? "var(--brand)" }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {leaf.label}
                        </span>
                        {leaf.meta ? (
                          <span className="max-w-24 shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                            {leaf.meta}
                          </span>
                        ) : null}
                      </>
                    );
                    return (
                      <li key={leaf.id}>
                        {leaf.href ? (
                          <Link
                            href={leaf.href}
                            className="flex items-center gap-1.5 text-xs text-foreground/85 hover:text-foreground"
                          >
                            {body}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-foreground/85">
                            {body}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {node.more > 0 && node.filter ? (
                  <button
                    type="button"
                    onClick={() => onPick(node.filter!)}
                    className="mt-1 flex items-center gap-0.5 text-xs text-link hover:underline"
                  >
                    View all {node.value}
                    <ChevronRight className="size-3" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
