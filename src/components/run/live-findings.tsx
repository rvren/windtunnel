"use client";

import { InfoTip } from "@/components/info-tip";
import { AnimatePresence } from "motion/react";

import { FadeInItem } from "@/components/motion";
import { agentById } from "@/lib/agents";
import { FINDING_TYPE_LABEL } from "@/lib/labels";
import type { Feed } from "@/lib/run-feed";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";

import { AgentIcon, SeverityBadge } from "./badges";

/** The id of the full list, for the newest finding's link to it. */
const FINDINGS_SO_FAR = "run-findings-so-far";

/**
 * The newest finding, as one line: what it is, who filed it and where.
 * It changes as findings arrive; the count beside it goes to the full
 * list. Nothing until the first finding is filed.
 */
export function LatestFinding({ feed }: { feed: Feed }) {
  const latest = feed.live[0];
  if (!latest) return null;
  return (
    <div
      className="flex items-center gap-4 px-5 pb-4 text-[0.8125rem] md:px-6"
      data-testid="run-latest-finding"
    >
      <ul className="min-w-0 flex-1">
        <FadeInItem
          key={latest.uid}
          className="flex min-w-0 items-center gap-2"
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: SEVERITY_TONE[latest.severity] }}
          />
          <span className="truncate">{latest.title}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <AgentIcon agentId={latest.agentId} className="size-3.5" />
            {agentById(latest.agentId)?.name}
          </span>
          {latest.path ? (
            <span className="hidden shrink-0 font-mono text-xs text-muted-foreground xl:inline">
              {latest.path}
              {latest.startLine ? `:${latest.startLine}` : ""}
            </span>
          ) : null}
        </FadeInItem>
      </ul>
      <a
        href={`#${FINDINGS_SO_FAR}`}
        className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums hover:text-foreground"
      >
        {feed.live.length} so far
      </a>
    </div>
  );
}

/**
 * Findings as the agents file them, newest first. Shown while a run is going
 * on; the judge has not ruled on these yet, and the report replaces this
 * list when it has.
 */
export function LiveFindings({ feed }: { feed: Feed }) {
  if (feed.live.length === 0) return null;
  return (
    <section id={FINDINGS_SO_FAR} data-testid="run-live-findings">
      <h2 className="flex items-baseline gap-2 text-sm font-medium">
        Findings so far
        <span className="font-mono text-xs text-muted-foreground">
          {feed.live.length}
        </span>
        <InfoTip
          about="liveFindings"
          label="Findings so far"
          className="self-center"
        />
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          Not judged yet
        </span>
      </h2>
      <ul className="mt-3 divide-y rounded-card border bg-card px-4">
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
