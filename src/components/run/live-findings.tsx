"use client";

import { AnimatePresence } from "motion/react";

import { FadeInItem } from "@/components/motion";
import { agentById } from "@/lib/agents";
import { FINDING_TYPE_LABEL } from "@/lib/labels";
import type { Feed } from "@/lib/run-feed";

import { AgentIcon, SeverityBadge } from "./badges";

/**
 * Findings as the agents file them, newest first. Shown while a run is going
 * on; the judge has not ruled on these yet, and the report replaces this
 * list when it has.
 */
export function LiveFindings({ feed }: { feed: Feed }) {
  if (feed.live.length === 0) return null;
  return (
    <section data-testid="run-live-findings">
      <h2 className="flex items-baseline gap-2 text-sm font-medium">
        Findings so far
        <span className="font-mono text-xs text-muted-foreground">
          {feed.live.length}
        </span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          Not judged yet
        </span>
      </h2>
      <ul className="mt-3 divide-y rounded-md border bg-card px-4">
        <AnimatePresence initial={false}>
          {feed.live.map((finding) => (
            <FadeInItem
              key={finding.uid}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 text-sm"
            >
              <SeverityBadge severity={finding.severity} />
              <span className="min-w-0 flex-1 basis-64 font-medium">
                {finding.title}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AgentIcon agentId={finding.agentId} className="size-3.5" />
                {agentById(finding.agentId)?.name}
              </span>
              <span className="basis-full text-xs text-muted-foreground">
                {FINDING_TYPE_LABEL[finding.type]}
                {finding.path ? (
                  <span className="font-mono">
                    {" "}
                    · {finding.path}
                    {finding.startLine ? `:${finding.startLine}` : ""}
                  </span>
                ) : null}
              </span>
            </FadeInItem>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
