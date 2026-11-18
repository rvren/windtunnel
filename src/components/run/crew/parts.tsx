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
