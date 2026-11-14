"use client";

import { InfoTip } from "@/components/info-tip";
import { Check, LoaderCircle, X } from "lucide-react";

import { FadeInItem } from "@/components/motion";
import { AGENTS } from "@/lib/agents";
import { STAGE_DESCRIPTION, STAGE_LABEL, STAGE_ORDER } from "@/lib/labels";
import type { Feed, StageState } from "@/lib/run-feed";
import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/server/engine/schema";

import { AgentIcon } from "./badges";

function StageMark({ state, index }: { state: StageState; index: number }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px]",
        state === "done" && "border-ok/50 text-ok",
        state === "running" && "border-brand text-brand",
        state === "failed" && "border-sev-critical/60 text-sev-critical",
        state === "pending" && "text-muted-foreground",
      )}
    >
      {state === "done" ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : state === "running" ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : state === "failed" ? (
        <X className="size-3.5" aria-hidden="true" />
      ) : (
        index + 1
      )}
    </span>
  );
}

/** The five stages in a row, each with what it is doing or what it found. */
export function StageRail({
  feed,
  repository,
}: {
  feed: Feed;
  /** A repository run has one more stage, the survey, at the start. */
  repository: boolean;
}) {
  const stages = STAGE_ORDER.filter(
    (stage) => repository || stage !== "survey",
  );
  return (
    <section aria-label="Stages">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        Stages
        <InfoTip about="stages" label="Stages" />
      </p>
      <ol
        className={cn(
          "grid gap-px overflow-hidden rounded-card border bg-border sm:grid-cols-4",
          repository ? "2xl:grid-cols-8" : "2xl:grid-cols-7",
        )}
        data-testid="run-stages"
      >
        {stages.map((stage, index) => {
          const { state, summary } = feed.stages[stage];
          return (
            <li
              key={stage}
              className="bg-card p-4"
              data-testid={`run-stage-${stage}`}
              data-state={state}
            >
              <div className="flex items-center gap-2.5">
                <StageMark state={state} index={index} />
                <span
                  className={cn(
                    "text-sm font-medium",
                    state === "pending" && "text-muted-foreground",
                  )}
                >
                  {STAGE_LABEL[stage]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {state === "done" && summary
                  ? summary
                  : state === "failed"
                    ? "Stopped here"
                    : STAGE_DESCRIPTION[stage]}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const AGENT_STATUS_TEXT: Record<AgentStatus, string> = {
  pending: "Waiting",
  running: "Walking scenarios",
  done: "Done",
  declined: "Declined",
  failed: "Failed",
};

/** One lane per agent: its state, and its scenarios as they arrive. */
export function AgentLanes({ feed }: { feed: Feed }) {
  return (
    <section aria-label="Agents">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        Agents
        <InfoTip about="agents" label="Agents" />
      </p>
      <ul
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        data-testid="run-agents"
      >
        {AGENTS.map((agent) => {
          const lane = feed.agents[agent.id];
          const count = lane.scenarios.length;
          return (
            <li
              key={agent.id}
              className="flex flex-col rounded-card border bg-card p-4 last:sm:col-span-2 last:lg:col-span-1"
              data-testid={`run-agent-${agent.id}`}
              data-status={lane.status}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <AgentIcon agentId={agent.id} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-tight font-medium">
                    {agent.name}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs text-muted-foreground",
                      lane.status === "running" && "text-brand",
                      lane.status === "failed" && "text-sev-critical",
                      lane.status === "declined" && "text-sev-high",
                    )}
                  >
                    {lane.status === "running" ? (
                      <LoaderCircle
                        className="size-3 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {AGENT_STATUS_TEXT[lane.status]}
                  </span>
                </span>
              </div>

              {count > 0 ? (
                <ol className="mt-4 space-y-2 border-t pt-3 text-xs leading-snug text-muted-foreground">
                  {lane.scenarios.map((title, index) => (
                    <FadeInItem
                      key={`${index}-${title}`}
                      className="flex gap-2"
                    >
                      <span className="font-mono text-link">{index + 1}</span>
                      <span>{title}</span>
                    </FadeInItem>
                  ))}
                </ol>
              ) : null}

              {lane.status === "done" || lane.findings > 0 ? (
                <p className="mt-auto pt-4 text-xs">
                  <span className="font-medium">{lane.findings}</span>{" "}
                  <span className="text-muted-foreground">
                    {lane.findings === 1 ? "finding" : "findings"}
                  </span>
                </p>
              ) : null}
              {lane.status === "running" && lane.reading ? (
                <p
                  className="mt-3 truncate font-mono text-[11px] text-muted-foreground"
                  title={lane.reading}
                >
                  {lane.reading}
                </p>
              ) : null}
              {lane.note ? (
                <p className="pt-1 text-xs text-muted-foreground">
                  {lane.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
