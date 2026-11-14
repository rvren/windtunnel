"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Minimize2 } from "lucide-react";

import { SampleBadge, StatusBadge } from "@/components/run/badges";
import type { Feed } from "@/lib/run-feed";
import type { Chapter } from "@/lib/viz/story";
import type { RunTimes } from "@/lib/viz/times";
import type { RunRecord } from "@/server/engine/schema";

import { Stepper } from "./stepper";
import { Story, type ReportTab } from "./story";
import { RunSummary } from "./summary";

/*
 * A run over the whole screen. The stepper runs along the top; the stage at
 * work fills the left; what the finished stages found stacks on the right,
 * newest first. When the run ends the left turns into the summary, and a
 * link opens the report (leaving focus). Esc leaves.
 */

export function RunFocus({
  run,
  chapters,
  feed,
  times,
  liveMap,
  onExit,
  onOpen,
}: {
  run: RunRecord;
  chapters: Chapter[];
  feed: Feed;
  times: RunTimes;
  liveMap?: React.ReactNode;
  onExit: () => void;
  /** Opens a report tab: leaves focus and scrolls to it. */
  onOpen: (tab: ReportTab) => void;
}) {
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onExit]);

  const running = chapters.filter((chapter) => chapter.state === "running");
  const failed = chapters.filter((chapter) => chapter.state === "failed");
  const done = chapters.filter((chapter) => chapter.state === "done").reverse();
  const ended = run.status !== "running";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Run, focus mode"
      data-testid="run-focus"
      className="dot-grid fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas"
    >
      <header className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
        <StatusBadge status={run.status} />
        {run.sample ? <SampleBadge /> : null}
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {run.title}
        </h2>
        {ended && run.designModel ? (
          <button
            type="button"
            onClick={() => onOpen("findings")}
            className="inline-flex items-center gap-1 text-xs text-link hover:underline"
          >
            Open The Report
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExit}
          data-testid="run-focus-exit"
          className="flex items-center gap-1 rounded-md bg-card/80 px-2 py-1 text-xs ring-1 ring-foreground/10 hover:bg-muted"
        >
          <Minimize2 className="size-3.5" aria-hidden="true" />
          Exit Focus
          <kbd className="ml-1 font-mono text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </button>
      </header>

      <div className="px-6">
        <Stepper
          chapters={chapters}
          onSelect={(chapter) =>
            document
              .getElementById(`focus-chapter-${chapter.stage}`)
              ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
          }
          className="bg-card/80 backdrop-blur"
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-6 pt-4 pb-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* The stage at work, or the summary once the run has ended */}
        <section className="min-h-0 overflow-y-auto pr-1" aria-label="Now">
          {ended && run.status === "completed" ? (
            <RunSummary run={run} times={times} onOpen={onOpen} />
          ) : running.length + failed.length > 0 ? (
            <Story
              probable={!run.source}
              chapters={[...running, ...failed]}
              feed={feed}
              times={times}
              liveMap={liveMap}
              onOpen={onOpen}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Starting the run…</p>
          )}
        </section>

        {/* What the finished stages found, newest first */}
        <section
          className="min-h-0 overflow-y-auto pr-1"
          aria-label="Finished stages"
          data-testid="run-focus-results"
        >
          {done.length > 0 ? (
            <div className="space-y-3">
              {done.map((chapter) => (
                <div key={chapter.stage} id={`focus-chapter-${chapter.stage}`}>
                  <Story
                    probable={!run.source}
                    chapters={[chapter]}
                    feed={feed}
                    times={times}
                    onOpen={onOpen}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-card border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Results appear here as each stage finishes.
            </p>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
