"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  KeyRound,
  X,
} from "lucide-react";

import { EASE } from "@/components/motion";
import { Segmented } from "@/components/tuff/segmented-control";
import { cn } from "@/lib/utils";

/*
 * The cockpit's stage: one frame of fixed height, so switching views never
 * moves the page. Everything floats on it: the top bar (the view's name,
 * the switcher, the way to the run), the filters and the legend, and the
 * card dock along the bottom, which folds away to give the view more room.
 * Under 768px the frame lets go of its height and the pieces stack.
 */

const DOCK_OPEN = 136;
const DOCK_SHUT = 0;
const TOP = 104;
const DOCK_KEY = "windtunnel:cockpit-dock";

/** The size of an element, kept current. Zero until measured. */
function useSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size] as const;
}

export interface StageChip {
  key: string;
  label: string;
}

export function Stage<V extends string>({
  views,
  view,
  onView,
  title,
  note,
  legend,
  chips,
  onRemoveChip,
  onClear,
  secrets,
  onSecrets,
  runId,
  dock,
  renderView,
  renderNarrow,
}: {
  views: { value: V; label: string }[];
  view: V;
  onView: (view: V) => void;
  title: string;
  note: string;
  legend: { label: string; tone: string }[];
  chips: StageChip[];
  onRemoveChip: (key: string) => void;
  onClear: () => void;
  /** Secrets found in the code; a chip shows them when there are any. */
  secrets: number;
  onSecrets: () => void;
  runId: string;
  dock: React.ReactNode;
  /** The picked view, laid out to fit this box. */
  renderView: (box: { width: number; height: number }) => React.ReactNode;
  /** The picked view and the cards, stacked, for narrow screens. */
  renderNarrow: () => React.ReactNode;
}) {
  const [ref, size] = useSize<HTMLElement>();
  // Read once on the client. Safe: nothing of the dock renders until the
  // stage is measured, which only happens in the browser.
  const [docked, setDocked] = useState(() => {
    try {
      return window.localStorage.getItem(DOCK_KEY) !== "shut";
    } catch {
      return true;
    }
  });
  const toggleDock = () => {
    setDocked((open) => {
      try {
        window.localStorage.setItem(DOCK_KEY, open ? "shut" : "open");
      } catch {
        // No storage: the choice lasts for this page only.
      }
      return !open;
    });
  };

  const narrow = size.width > 0 && size.width < 768;
  const bottom = docked ? DOCK_OPEN : DOCK_SHUT;
  const box = {
    width: Math.max(0, size.width - 48),
    height: Math.max(0, size.height - TOP - bottom - 28),
  };

  const bar = (
    <div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-[1fr_auto_1fr]">
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="truncate text-xs text-muted-foreground">{note}</p>
      </div>
      {views.length > 1 ? (
        <Segmented
          label="Canvas view"
          options={views}
          value={view}
          onValueChange={(next) => onView(next as V)}
          className="md:justify-self-center"
        />
      ) : (
        <span />
      )}
      <Link
        href={`/app/runs/${runId}`}
        className="flex items-center gap-1 text-xs text-link hover:underline md:justify-self-end"
        data-testid="cockpit-open-run"
      >
        Open the run
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );

  const filters = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-h-7 flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onRemoveChip(chip.key)}
            aria-label={`Remove the filter ${chip.label}`}
            data-testid={`stage-filter-${chip.key}`}
            className="flex h-7 items-center gap-1 rounded-md bg-brand/15 px-2 text-xs text-foreground ring-1 ring-brand/40"
          >
            {chip.label}
            <X className="size-3" aria-hidden="true" />
          </button>
        ))}
        {chips.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            data-testid="stage-filter-clear"
            className="px-1 text-xs text-link hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {legend.map((item) => (
          <span
            key={item.label}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className="h-0.5 w-3 rounded-full"
              style={{ background: item.tone }}
            />
            {item.label}
          </span>
        ))}
        {!narrow ? (
          <button
            type="button"
            onClick={toggleDock}
            aria-expanded={docked}
            data-testid="cockpit-dock-toggle"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground"
          >
            {docked ? (
              <ChevronDown className="size-3" aria-hidden="true" />
            ) : (
              <ChevronUp className="size-3" aria-hidden="true" />
            )}
            {docked ? "Hide cards" : "Show cards"}
          </button>
        ) : null}
        {secrets > 0 ? (
          <button
            type="button"
            onClick={onSecrets}
            className="flex items-center gap-1.5 rounded-md bg-sev-critical/12 px-2 py-0.5 text-[11px] text-sev-critical"
            data-testid="cockpit-secrets"
          >
            <KeyRound className="size-3" aria-hidden="true" />
            {secrets} {secrets === 1 ? "secret" : "secrets"} in the code
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-card bg-canvas bg-grid-dots",
        !narrow && "h-[640px] xl:h-[700px]",
      )}
      data-testid="cockpit-stage"
      data-view={view}
    >
      {narrow ? (
        <div className="space-y-4 p-4">
          {bar}
          {filters}
          {renderNarrow()}
        </div>
      ) : size.width === 0 ? null : (
        <>
          {/* The view, in the box between the bar and the dock */}
          <div
            className="absolute right-6 left-6 transition-[bottom] duration-500"
            style={{ top: TOP + 20, bottom: bottom + 8 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="h-full"
              >
                {box.height > 0 ? renderView(box) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Overlays: bar and filters on top, fading into the canvas */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-canvas via-canvas/90 to-transparent px-5 pt-4 pb-6">
            <div className="pointer-events-auto space-y-3">
              {bar}
              {filters}
            </div>
          </div>

          {/* The card dock */}
          <div
            className="absolute inset-x-3 bottom-3 transition-transform duration-500"
            style={{
              height: DOCK_OPEN - 12,
              transform: docked
                ? "translateY(0)"
                : `translateY(${DOCK_OPEN}px)`,
            }}
            aria-hidden={!docked}
            inert={!docked}
          >
            {dock}
          </div>
        </>
      )}
    </section>
  );
}
