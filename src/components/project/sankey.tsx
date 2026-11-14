"use client";

import { motion } from "motion/react";

import { EASE } from "@/components/motion";
import { useWidth } from "@/hooks/use-width";
import { NODE_WIDTH, layoutFlow } from "@/lib/sankey-layout";
import { cn } from "@/lib/utils";
import type { Severity } from "@/server/engine/schema";
import type { SankeyLink, SankeyNode } from "@/server/projects/cockpit";

/*
 * The flow of issues: where they are → what kind they are → how bad they
 * are. A band's width is the number of issues. Bands are neutral and take a
 * colour only where they reach a severity. A node is a button: it filters
 * the list of issues.
 */

const SEVERITY_VAR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

/** Room on the right for the last column's labels. */
const LABEL_ROOM = 104;
const ROW = 46;

export function Sankey({
  nodes,
  links,
  heading,
  selected,
  onSelect,
}: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** The name of each column, left to right. */
  heading: [string, string, string];
  /** The ids of the nodes that filter the list right now. */
  selected: string[];
  onSelect: (node: SankeyNode) => void;
}) {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const width = Math.max(measured, 560);
  const rows = Math.max(
    ...[0, 1, 2].map(
      (column) => nodes.filter((node) => node.column === column).length,
    ),
  );
  const height = Math.max(220, rows * ROW);
  const top = 26;
  const layout = layoutFlow(nodes, links, {
    width: width - LABEL_ROOM,
    height,
    gap: 14,
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const linkOf = new Map(
    links.map((link) => [`${link.source}>${link.target}`, link]),
  );
  const columnX = [0, 1, 2].map(
    (column) => layout.nodes.find((node) => node.column === column)?.x ?? 0,
  );

  return (
    <div ref={ref} className="overflow-x-auto" data-testid="cockpit-sankey">
      {measured > 0 ? (
        <svg
          width={width}
          height={height + top}
          role="group"
          aria-label="Issues by where they are, their kind and their severity"
          className="block text-foreground"
        >
          {heading.map((label, column) => (
            <text
              key={label}
              x={column === 2 ? columnX[2] + NODE_WIDTH + 10 : columnX[column]}
              y={11}
              className="fill-muted-foreground text-[11px] tracking-[0.08em] uppercase"
            >
              {label}
            </text>
          ))}
          <g transform={`translate(0 ${top})`}>
            {layout.links.map((link, index) => {
              const severity = linkOf.get(
                `${link.source}>${link.target}`,
              )?.severity;
              const lit =
                selected.includes(link.source) ||
                selected.includes(link.target);
              return (
                <motion.path
                  key={`${link.source}>${link.target}`}
                  d={link.d}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: 0.7,
                    ease: EASE,
                    delay: 0.05 + index * 0.025,
                  }}
                  style={
                    severity ? { fill: SEVERITY_VAR[severity] } : undefined
                  }
                  className={cn(
                    "transition-[fill-opacity] duration-300",
                    severity
                      ? lit
                        ? "[fill-opacity:0.55]"
                        : "[fill-opacity:0.26]"
                      : lit
                        ? "fill-current [fill-opacity:0.2]"
                        : "fill-current [fill-opacity:0.07]",
                  )}
                />
              );
            })}
            {layout.nodes.map((placed) => {
              const node = byId.get(placed.id)!;
              const active = selected.includes(node.id);
              const middle = placed.y + placed.height / 2;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${node.label}: ${node.value}. Filter the issues`}
                  data-testid="cockpit-sankey-node"
                  data-node={node.id}
                  onClick={() => onSelect(node)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelect(node);
                  }}
                  className="group cursor-pointer outline-none"
                >
                  {/* A wide, unseen target, so a thin node is easy to hit. */}
                  <rect
                    x={placed.x - 4}
                    y={placed.y - 4}
                    width={node.column === 2 ? LABEL_ROOM : 150}
                    height={Math.max(placed.height + 8, 22)}
                    fill="transparent"
                  />
                  <rect
                    x={placed.x}
                    y={placed.y}
                    width={NODE_WIDTH}
                    height={Math.max(placed.height, 2)}
                    rx={1.5}
                    style={
                      node.severity
                        ? { fill: SEVERITY_VAR[node.severity] }
                        : undefined
                    }
                    className={cn(
                      !node.severity && "fill-current",
                      !node.severity && !active && "[fill-opacity:0.6]",
                    )}
                  />
                  <text
                    x={placed.x + NODE_WIDTH + 10}
                    y={middle}
                    dominantBaseline="central"
                    className={cn(
                      "fill-current text-[13px] [paint-order:stroke] stroke-card [stroke-width:4px] group-hover:underline group-focus-visible:underline",
                      active && "font-medium",
                    )}
                  >
                    {node.label}
                    <tspan className="fill-muted-foreground" dx={6}>
                      {node.value}
                    </tspan>
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div style={{ height: height + top }} />
      )}
    </div>
  );
}
