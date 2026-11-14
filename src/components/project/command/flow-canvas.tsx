"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";

import { EASE } from "@/components/motion";
import { cn } from "@/lib/utils";
import type {
  FlowFilter,
  FlowGroup,
  FlowNodeData,
  FlowView,
} from "@/lib/viz/cockpit-views";
import { layoutStage, type StageNode } from "@/lib/viz/stage-layout";

/*
 * Draws a flow view into a box of a given size: sources on the left as
 * ringed circles, hubs in the middle with a ring of ticks, groups on the
 * right that list a few items. Bands are bundles of thin strands in their
 * colour. The SVG draws bands and rings; the words are HTML on top. The
 * layout (src/lib/viz/stage-layout.ts) fits the box exactly, so every view
 * has the same height.
 */

const TICKS = 44;

interface Props {
  view: FlowView;
  width: number;
  height: number;
  /** Node ids that filter the list now. */
  selected: string[];
  onPick: (filter: FlowFilter) => void;
}

function Ticks({ r, tone }: { r: number; tone: string }) {
  const cx = 0;
  const cy = 0;
  return (
    <g aria-hidden="true">
      {Array.from({ length: TICKS }, (_, index) => {
        const angle = (index / TICKS) * Math.PI * 2;
        const inner = r + 5;
        const outer = r + (index % 4 === 0 ? 13 : 9);
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

/** The views as three plain lists, for narrow screens. */
export function FlowLists({
  view,
  selected,
  onPick,
}: Omit<Props, "width" | "height">) {
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

export function FlowCanvas({ view, width, height, selected, onPick }: Props) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const layout = layoutStage(view, { width, height });
  // Nodes glide to their new place when the box changes size.
  const glide = reduced ? { duration: 0 } : { duration: 0.45, ease: EASE };

  // What is lit: the hovered node, else what filters the list.
  const lit = hovered ? [hovered] : selected;
  const touches = (band: { source: string; target: string }) =>
    lit.length === 0 || lit.includes(band.source) || lit.includes(band.target);
  const act = (node: StageNode) =>
    node.data.filter ? () => onPick(node.data.filter!) : null;
  const pickable = (node: StageNode) => {
    const run = act(node);
    return run
      ? {
          role: "button" as const,
          tabIndex: 0,
          "aria-pressed": selected.includes(node.id),
          onClick: run,
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              run();
            }
          },
        }
      : {};
  };
  const hover = (id: string) => ({
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(id),
    onBlur: () => setHovered(null),
  });

  return (
    <div
      className="relative"
      style={{ width, height }}
      data-testid="flow-canvas"
    >
      <svg
        width={width}
        height={height}
        className="absolute inset-0 overflow-visible"
        role="img"
        aria-label={view.heading.join(" to ")}
      >
        {/* Bands, as bundles of strands */}
        {layout.bands.map((band, index) => {
          const on = touches(band);
          const strands = Math.max(
            1,
            Math.min(3, Math.round(band.thickness / 4)),
          );
          const mid = (band.x0 + band.x1) / 2;
          return (
            <g
              key={`${band.source}>${band.target}>${band.tone}`}
              className={cn(
                "transition-opacity duration-300",
                on && lit.length > 0 && "glow",
              )}
              opacity={on ? 1 : 0.12}
            >
              {Array.from({ length: strands }, (_, strand) => {
                const offset = (band.thickness * (strand + 0.5)) / strands;
                const a = band.y0 + offset;
                const b = band.y1 + offset;
                const d = `M${band.x0} ${a}C${mid} ${a} ${mid} ${b} ${band.x1} ${b}`;
                return (
                  <motion.path
                    key={strand}
                    fill="none"
                    stroke={band.tone}
                    style={{ strokeOpacity: "var(--strand-opacity)" }}
                    strokeWidth={Math.min(
                      2.25,
                      Math.max(1, (band.thickness / strands) * 0.5),
                    )}
                    strokeLinecap="round"
                    initial={reduced ? { d } : { d, pathLength: 0 }}
                    animate={{ d, pathLength: 1 }}
                    transition={{
                      d: glide,
                      pathLength: {
                        duration: reduced ? 0 : 0.9,
                        ease: EASE,
                        delay: 0.04 * (index % 12),
                      },
                    }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Sources: ringed circles */}
        {layout.sources.map((node) => {
          const on = lit.includes(node.id);
          return (
            <motion.g
              key={node.id}
              className={cn(on && "glow")}
              initial={false}
              animate={{ x: node.x, y: node.y }}
              transition={glide}
            >
              <motion.circle
                initial={false}
                animate={{ r: node.r + (node.compact ? 4 : 8) }}
                transition={glide}
                fill="none"
                stroke="var(--canvas-ring)"
                strokeDasharray="2 5"
              />
              <motion.circle
                initial={false}
                animate={{ r: node.r }}
                transition={glide}
                fill="var(--canvas-node)"
                stroke={on ? "var(--brand)" : "var(--canvas-ring)"}
                strokeWidth={on ? 1.5 : 1}
              />
            </motion.g>
          );
        })}

        {/* Hubs: a ring of ticks */}
        {layout.hubs.map((node) => {
          const on = lit.includes(node.id);
          const tone = node.data.tone ?? "var(--brand)";
          return (
            <motion.g
              key={node.id}
              className={cn("glow-soft", on && "glow")}
              initial={false}
              animate={{ x: node.x, y: node.y }}
              transition={glide}
            >
              {node.compact ? null : <Ticks r={node.r} tone={tone} />}
              <circle
                r={node.r}
                fill="var(--canvas-node)"
                stroke={on ? tone : "var(--canvas-ring)"}
              />
            </motion.g>
          );
        })}

        {/* Groups: a dot where the bands land */}
        {layout.groups.map((node) => (
          <motion.circle
            key={node.id}
            initial={false}
            animate={{ cx: node.x, cy: node.y }}
            transition={glide}
            r={5}
            fill={node.data.tone ?? "var(--muted-foreground)"}
            className={cn(lit.includes(node.id) && "glow")}
          />
        ))}
      </svg>

      {/* Column headings */}
      {layout.columns.map((x, index) => (
        <motion.p
          key={view.heading[index]}
          initial={false}
          animate={{ left: index === 2 ? x + 60 : x }}
          transition={glide}
          className="absolute -top-5 -translate-x-1/2 text-[10px] tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase"
        >
          {view.heading[index]}
        </motion.p>
      ))}

      {/* Words on top */}
      {layout.sources.map((node) =>
        node.compact ? (
          <motion.div
            key={node.id}
            {...pickable(node)}
            {...hover(node.id)}
            data-testid="flow-source"
            initial={false}
            animate={{ left: node.x - node.r - 12, top: node.y }}
            transition={glide}
            title={`${node.data.label}: ${node.data.sub ?? node.data.value}`}
            className="absolute flex w-40 -translate-x-full -translate-y-1/2 items-baseline justify-end gap-2 text-right outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="truncate text-[11px] tracking-[0.08em] uppercase">
              {node.data.label}
            </span>
            <span className="font-mono text-xs tabular-nums">
              {node.data.value}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key={node.id}
            {...pickable(node)}
            {...hover(node.id)}
            data-testid="flow-source"
            initial={false}
            animate={{ left: node.x, top: node.y - node.r }}
            transition={glide}
            className="absolute flex w-36 -translate-x-1/2 flex-col items-center text-center outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span
              className={cn(
                "flex items-center font-light tabular-nums",
                node.r > 28 ? "text-xl" : "text-base",
              )}
              style={{ height: node.r * 2 }}
            >
              {node.data.value}
            </span>
            <span className="mt-2.5 line-clamp-1 max-w-full rounded-sm bg-canvas/85 px-1.5 text-[11px] tracking-[0.1em] uppercase">
              {node.data.label}
            </span>
            {node.data.sub ? (
              <span className="text-[11px] text-muted-foreground">
                {node.data.sub}
              </span>
            ) : null}
          </motion.div>
        ),
      )}
      {layout.hubs.map((node) =>
        node.compact ? (
          <motion.div
            key={node.id}
            {...pickable(node)}
            {...hover(node.id)}
            data-testid="flow-hub"
            initial={false}
            animate={{ left: node.x, top: node.y + node.r + 2 }}
            transition={glide}
            className="absolute flex w-48 -translate-x-1/2 items-baseline justify-center gap-1.5 text-center outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="truncate rounded-sm bg-canvas/85 px-1 text-xs font-medium">
              {node.data.label}
            </span>
            <span className="font-mono text-xs tabular-nums">
              {node.data.value}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key={node.id}
            {...pickable(node)}
            {...hover(node.id)}
            data-testid="flow-hub"
            initial={false}
            animate={{ left: node.x, top: node.y - node.r }}
            transition={glide}
            className="absolute flex w-48 -translate-x-1/2 flex-col items-center text-center outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span
              className={cn(
                "flex items-center font-light tabular-nums",
                node.r > 28 ? "text-2xl" : "text-lg",
              )}
              style={{ height: node.r * 2 }}
            >
              {node.data.value}
            </span>
            <span className="mt-3.5 rounded-sm bg-canvas/85 px-1.5 text-sm font-medium">
              {node.data.label}
            </span>
            {node.data.sub ? (
              <span className="text-[11px] text-muted-foreground">
                {node.data.sub}
              </span>
            ) : null}
          </motion.div>
        ),
      )}
      {layout.groups.map((node) => (
        <motion.div
          key={node.id}
          {...hover(node.id)}
          data-testid="flow-group"
          initial={false}
          animate={{ left: node.x + 14, top: node.top }}
          transition={glide}
          className="absolute w-[244px]"
        >
          <div
            {...pickable(node)}
            className="flex items-baseline gap-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="text-lg leading-none font-light tabular-nums">
              {node.data.value}
            </span>
            <span className="text-[11px] tracking-[0.1em] uppercase">
              {node.data.label}
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {(node.data.leaves ?? []).slice(0, node.leaves).map((leaf) => {
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: leaf.tone ?? "var(--brand)" }}
                  />
                  <span className="min-w-0 flex-1 truncate">{leaf.label}</span>
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
                      title={leaf.label}
                      className="flex items-center gap-1.5 text-xs text-foreground/85 hover:text-foreground"
                    >
                      {content}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-foreground/85">
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {node.data.filter &&
          (node.data.more > 0 ||
            node.leaves < (node.data.leaves?.length ?? 0)) ? (
            <button
              type="button"
              onClick={() => onPick(node.data.filter!)}
              className="mt-0.5 flex items-center gap-0.5 text-xs text-link hover:underline"
            >
              View all {node.data.value}
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
