"use client";

import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Crew } from "@/lib/viz/crew";

/** The last part of a path, or text cut to a length, for a tight label. */
export function clip(text: string | null, max = 34): string {
  if (!text) return "";
  const value =
    text.includes("/") && !text.includes(" ")
      ? text.split("/").slice(-2).join("/")
      : text;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * What is happening while a run goes on: one large sentence, with who is
 * at work and on what in the full colour and the words between them
 * softer, and under it a quiet line for what each worker is on this
 * moment. The line keeps its height when empty, so the drawing under it
 * never moves.
 */
export function CrewHeadline({ crew }: { crew: Crew }) {
  return (
    <div className="relative z-10 px-6 pt-9 pb-7 text-center md:pb-8">
      <p
        className="text-2xl leading-snug font-semibold tracking-[-0.02em] text-balance md:text-3xl"
        aria-live="polite"
        data-testid="run-now"
      >
        {crew.words.map((word, index) => (
          <span
            key={`${index}-${word.text}`}
            className={cn(word.soft && "font-medium text-foreground/50")}
          >
            {word.text}
          </span>
        ))}
      </p>
      <p
        className="mt-2.5 flex h-5 items-center justify-center gap-x-6 overflow-hidden text-[0.8125rem] text-muted-foreground"
        data-testid="run-now-detail"
      >
        {crew.now.map((worker, index) => {
          const file =
            worker.doing.includes("/") && !worker.doing.includes(" ");
          return (
            <span
              key={worker.name}
              className={cn(
                "flex min-w-0 items-center gap-1.5",
                index > 0 && "max-sm:hidden",
              )}
            >
              <span className="shrink-0 text-foreground/80">{worker.name}</span>
              <span className="shrink-0">{file ? "reading" : "on"}</span>
              <span
                className={cn("truncate", file && "font-mono text-xs")}
                title={worker.doing}
              >
                {clip(worker.doing, 38)}
              </span>
            </span>
          );
        })}
      </p>
    </div>
  );
}

/** What is happening, in one line, over a live view of the crew. */
export function CrewHeader({ crew }: { crew: Crew }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
        {crew.ended ? null : (
          <LoaderCircle
            className="size-4 animate-spin text-brand"
            aria-hidden="true"
          />
        )}
        {crew.sentence}
      </p>
      <p className="ml-auto flex gap-3 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
        {crew.members.some((member) => member.findings !== null) ? (
          <span className={cn(crew.findings > 0 && "text-foreground")}>
            {crew.findings} found
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * On a narrow screen the drawing is too small to read: the same facts as a
 * list under it.
 */
export function CrewList({ crew }: { crew: Crew }) {
  return (
    <ul className="hidden divide-y divide-border/60 px-5 pb-2 @max-lg:block">
      {crew.members.map((member) => (
        <li
          key={member.id}
          className="flex items-center gap-3 py-2 text-[0.8125rem]"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              member.status === "running"
                ? "bg-brand"
                : member.status === "done"
                  ? "bg-ok"
                  : member.status === "pending"
                    ? "bg-muted-foreground/40"
                    : "bg-sev-critical",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block">{member.name}</span>
            {member.doing || member.note ? (
              <span className="block truncate text-xs text-muted-foreground">
                {member.status === "running" ? member.doing : member.note}
              </span>
            ) : null}
          </span>
          {member.findings !== null ? (
            <span className="font-mono text-sm tabular-nums">
              {member.findings}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
