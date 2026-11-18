"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { EASE } from "@/components/motion";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/lib/viz/story";

import { seconds } from "../stage-time";

/*
 * The stages of a run in one row, joined by a line that fills as they
 * finish. A finished stage shows a check and its time; the running one a
 * slowly turning ring of ticks (work is going on); later ones are dim; a
 * failed one is red. Selecting a stage that has a chapter scrolls to it.
 *
 * As a card it stands on its own (focus mode). As a rail it sits at the
 * foot of the run's wind tunnel: no heading, no surface of its own,
 * smaller and quieter, with one line under it for what the running stage
 * is doing.
 */

const TICKS = 24;

function RunningRing() {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      viewBox="-20 -20 40 40"
      className="absolute inset-0 size-full text-brand glow"
      aria-hidden="true"
      animate={reduced ? undefined : { rotate: 360 }}
      transition={{ duration: 8, ease: "linear", repeat: Infinity }}
    >
      {Array.from({ length: TICKS }, (_, index) => {
        const angle = (index / TICKS) * Math.PI * 2;
        return (
          <line
            key={index}
            x1={Math.cos(angle) * 15}
            y1={Math.sin(angle) * 15}
            x2={Math.cos(angle) * (index % 3 === 0 ? 19 : 17.5)}
            y2={Math.sin(angle) * (index % 3 === 0 ? 19 : 17.5)}
            stroke="currentColor"
            strokeOpacity={index % 3 === 0 ? 0.95 : 0.45}
            strokeWidth={1.2}
          />
        );
      })}
    </motion.svg>
  );
}

export function Stepper({
  chapters,
  onSelect,
  action,
  className,
  variant = "card",
}: {
  chapters: Chapter[];
  onSelect: (chapter: Chapter) => void;
  /** A control at the end of the heading row, such as Focus. */
  action?: React.ReactNode;
  className?: string;
  variant?: "card" | "rail";
}) {
  const rail = variant === "rail";
  const current = chapters.find((chapter) => chapter.state === "running");
  const done = chapters.filter((chapter) => chapter.state === "done").length;
  const running = chapters.some((chapter) => chapter.state === "running");
  // The line fills up to the running stage, or to the last finished one.
  const filled =
    chapters.length > 1
      ? Math.max(0, (running ? done : done - 1) / (chapters.length - 1))
      : done > 0
        ? 1
        : 0;

  return (
    <section
      aria-label="Stages"
      className={cn(
        rail ? "px-5 pt-3 pb-3 md:px-6" : "rounded-card bg-card px-5 pt-4 pb-3",
        className,
      )}
      data-testid="run-stages"
    >
      {rail ? null : (
        <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          Stages
          <InfoTip about="stages" label="Stages" />
          <span className="ml-auto font-mono tabular-nums">
            {done} of {chapters.length}
          </span>
          {action}
        </p>
      )}
      {/* Scrolls sideways on a phone; the padding keeps the rings and their
          glow inside the scroll box, which clips both ways. */}
      <div className="-mx-2 overflow-x-auto px-2 py-2">
        <ol
          className="relative grid min-w-[640px]"
          style={{ gridTemplateColumns: `repeat(${chapters.length}, 1fr)` }}
        >
          {/* The line behind the stages, and how far it has filled */}
          <span
            aria-hidden="true"
            className={cn("absolute h-px bg-border", rail ? "top-3" : "top-4")}
            style={{
              left: `${50 / chapters.length}%`,
              right: `${50 / chapters.length}%`,
            }}
          />
          <motion.span
            aria-hidden="true"
            className={cn(
              "absolute h-px origin-left",
              rail ? "top-3 bg-brand/70" : "top-4 bg-brand glow",
            )}
            style={{
              left: `${50 / chapters.length}%`,
              width: `${100 - 100 / chapters.length}%`,
            }}
            initial={false}
            animate={{ scaleX: Math.max(0, filled) }}
            transition={{ duration: 0.8, ease: EASE }}
          />
          {chapters.map((chapter) => {
            const clickable = chapter.state !== "pending";
            return (
              <li key={chapter.stage} className="relative flex justify-center">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onSelect(chapter)}
                  data-testid={`stage-${chapter.stage}`}
                  data-state={chapter.state}
                  className={cn(
                    "group flex flex-col items-center text-center outline-none disabled:cursor-default",
                    rail ? "gap-1.5" : "gap-2",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex items-center justify-center rounded-full bg-card ring-1 transition-colors duration-300",
                      rail ? "size-6" : "size-8",
                      chapter.state === "done" &&
                        (rail
                          ? "text-foreground ring-foreground/30"
                          : "bg-brand text-brand-foreground ring-brand"),
                      chapter.state === "running" && "ring-brand/40",
                      chapter.state === "failed" &&
                        "bg-sev-critical text-white ring-sev-critical",
                      chapter.state === "pending" &&
                        "text-muted-foreground ring-border",
                      "group-focus-visible:outline-2 group-focus-visible:outline-ring",
                    )}
                  >
                    {chapter.state === "done" ? (
                      <motion.span
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.35, ease: EASE }}
                      >
                        <Check
                          className={rail ? "size-3" : "size-4"}
                          aria-hidden="true"
                        />
                      </motion.span>
                    ) : chapter.state === "failed" ? (
                      <X className="size-4" aria-hidden="true" />
                    ) : chapter.state === "running" ? (
                      <>
                        <RunningRing />
                        <span className="size-1.5 rounded-full bg-brand" />
                      </>
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      chapter.state === "pending" && "text-muted-foreground",
                    )}
                  >
                    {chapter.label}
                  </span>
                  <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                    {chapter.state === "done" && chapter.seconds !== null
                      ? seconds(chapter.seconds)
                      : chapter.state === "running"
                        ? "working"
                        : chapter.state === "failed"
                          ? "failed"
                          : " "}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {rail && current ? (
        <p
          className="mt-1 truncate text-center text-xs text-muted-foreground"
          aria-live="polite"
          data-testid="run-stage-now"
        >
          {current.line}
        </p>
      ) : null}
    </section>
  );
}
