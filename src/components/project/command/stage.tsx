"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { EASE } from "@/components/motion";
import { Segmented } from "@/components/tuff/segmented-control";
import type { ExplainKey } from "@/lib/explain";
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
/** The width of focus mode's widget column. */
const RAIL = 320;

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
  about,
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
  focus = false,
  onFocus,
  onExit,
  rail,
}: {
  views: { value: V; label: string }[];
  view: V;
  onView: (view: V) => void;
  title: string;
  /** Which explanation the "i" beside the title shows. */
  about?: ExplainKey;
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
  /** Focus mode: the stage fills the screen, over everything else. */
  focus?: boolean;
  onFocus?: () => void;
  onExit?: () => void;
  /** Widgets down the right side, in focus mode. */
  rail?: React.ReactNode;
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

  useEffect(() => {
    if (!focus) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      // A drawer open on top closes first; Esc leaves focus only after.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[data-slot="sheet-content"]')) return;
      onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [focus, onExit]);

  const narrow = size.width > 0 && size.width < 768;
  const railWidth = rail && !narrow ? RAIL : 0;
  const bottom = docked ? DOCK_OPEN : DOCK_SHUT;
  const box = {
    width: Math.max(0, size.width - 48 - railWidth),
    height: Math.max(0, size.height - TOP - bottom - 28),
  };

  const bar = (
    <div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-[1fr_auto_1fr]">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {about ? <InfoTip about={about} label={title} /> : null}
        </h2>
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
      <div className="flex items-center gap-3 md:justify-self-end">
        <Link
          href={`/app/runs/${runId}`}
          className="flex items-center gap-1 text-xs text-link hover:underline"
          data-testid="cockpit-open-run"
        >
          Open The Run
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        {focus ? (
          <button
            type="button"
            onClick={onExit}
            data-testid="cockpit-focus-exit"
            className="flex items-center gap-1 rounded-md bg-card/80 px-2 py-1 text-xs ring-1 ring-foreground/10 hover:bg-muted"
          >
            <Minimize2 className="size-3.5" aria-hidden="true" />
            Exit Focus
            <kbd className="ml-1 font-mono text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </button>
        ) : onFocus ? (
          <button
            type="button"
            onClick={onFocus}
            data-testid="cockpit-focus"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground"
          >
            <Maximize2 className="size-3.5" aria-hidden="true" />
            Focus
          </button>
        ) : null}
      </div>
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
            {docked ? "Hide Cards" : "Show Cards"}
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

  const frame = (
    <section
      ref={ref}
      className={cn(
        "overflow-hidden bg-canvas dot-grid",
        focus ? "fixed inset-0 z-50 overflow-y-auto" : "relative rounded-card",
        !focus && !narrow && "h-[640px] xl:h-[700px]",
      )}
      data-testid="cockpit-stage"
      data-focus={focus ? "on" : undefined}
      role={focus ? "dialog" : undefined}
      aria-modal={focus ? true : undefined}
      aria-label={focus ? "Cockpit, focus mode" : undefined}
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
            className="absolute left-6"
            style={{ top: TOP + 20, bottom: bottom + 8, right: 24 + railWidth }}
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

          {railWidth ? (
            <div
              className="absolute right-4"
              style={{
                top: TOP + 4,
                bottom: bottom + 8,
                width: railWidth - 16,
              }}
            >
              {rail}
            </div>
          ) : null}

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
  // In focus mode the stage is drawn into the body, so no parent's motion
  // or overflow can move or clip it.
  // A placeholder keeps the page's height while the stage is out of it.
  return focus ? (
    <>
      <div
        aria-hidden="true"
        className="h-[640px] rounded-card bg-canvas/40 xl:h-[700px]"
      />
      {createPortal(frame, document.body)}
    </>
  ) : (
    frame
  );
}
