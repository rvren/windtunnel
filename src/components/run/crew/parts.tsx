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
