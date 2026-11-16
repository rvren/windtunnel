"use client";

import { AgentIcon } from "@/components/run/badges";
import { agentById, AGENT_IDS } from "@/lib/agents";
import type { Feed } from "@/lib/run-feed";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/lib/viz/story";
import type { AgentStatus } from "@/server/engine/schema";

import { seconds } from "./stage-time";

/*
 * The run as an activity log, beside the story: each stage with what it
 * said, then each agent with how far it got. Quiet: a dot, a line, a time.
 */

const STATE_DOT: Record<Chapter["state"], string> = {
  pending: "bg-foreground/15",
  running: "bg-brand animate-pulse",
  done: "bg-ok",
  failed: "bg-sev-critical",
};

const AGENT_NOTE: Record<AgentStatus, string> = {
  pending: "Waiting",
  running: "Working",
  done: "Done",
  failed: "Failed",
  declined: "Declined",
};

export function ActivityRail({
  chapters,
  feed,
}: {
  chapters: Chapter[];
  feed: Feed;
}) {
  return (
    <aside
      className="space-y-5 text-[13px] xl:sticky xl:top-16 xl:self-start"
      aria-label="Activity"
      data-testid="run-activity"
    >
      <section>
        <h2 className="mb-2 text-xs text-muted-foreground">Activity</h2>
        <ol className="relative space-y-3 border-l pl-4">
          {chapters.map((chapter) => (
            <li key={chapter.stage} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1.5 -left-[20.5px] size-2 rounded-full ring-2 ring-background",
                  STATE_DOT[chapter.state],
                )}
              />
              <p className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    chapter.state === "pending"
                      ? "text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  {chapter.label}
                </span>
                {chapter.seconds !== null ? (
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {seconds(chapter.seconds)}
                  </span>
                ) : null}
              </p>
              {chapter.line && chapter.state !== "pending" ? (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {chapter.line}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 text-xs text-muted-foreground">Agents</h2>
        <ul className="space-y-1.5">
          {AGENT_IDS.map((id) => {
            const agent = feed.agents[id];
            return (
              <li key={id} className="flex items-center gap-2">
                <AgentIcon agentId={id} className="size-3.5" />
                <span className="flex-1 truncate">
                  {agentById(id)?.name ?? id}
                </span>
                <span className="text-xs text-muted-foreground">
                  {agent.findings > 0
                    ? `${agent.findings} filed`
                    : (AGENT_NOTE[agent.status as keyof typeof AGENT_NOTE] ??
                      "")}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
