"use client";

import { SegmentedBar } from "@/components/tuff/progress-bar";
import { stageSegments, type RunTimes } from "@/lib/viz/times";

/** The brand, stepping lighter stage by stage, so the bar reads as one thing. */
const shade = (index: number, count: number) =>
  `color-mix(in oklab, var(--brand) ${100 - Math.round((index / Math.max(1, count - 1)) * 65)}%, var(--surface-raised))`;

export const seconds = (value: number) =>
  value < 60
    ? `${value.toFixed(1)} s`
    : `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`;

/**
 * Where the run's time went: one bar, a segment per finished stage, timed
 * from the run's events. Nothing shows until a stage has finished.
 */
export function StageTime({ times }: { times: RunTimes }) {
  const segments = stageSegments(times);
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, item) => sum + item.seconds, 0);
  return (
    <section
      className="rounded-card bg-card p-5"
      aria-label="Time by stage"
      data-testid="stage-time"
    >
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium">Time by stage</h2>
        <p className="font-mono text-sm tabular-nums">{seconds(total)}</p>
      </div>
      <SegmentedBar
        label="Time by stage"
        valueText={segments
          .map((item) => `${item.label} ${seconds(item.seconds)}`)
          .join(", ")}
        max={Math.max(total, 0.001)}
        segments={segments.map((item, index) => ({
          id: item.id,
          label: item.label,
          value: item.seconds,
          color: shade(index, segments.length),
        }))}
      />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((item, index) => (
          <li key={item.id} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: shade(index, segments.length) }}
            />
            {item.label}
            <span className="font-mono text-foreground tabular-nums">
              {seconds(item.seconds)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
