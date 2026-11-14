"use client";

import { LayoutGroup, motion } from "motion/react";
import { Check, FolderGit2, LoaderCircle } from "lucide-react";

import { EASE } from "@/components/motion";
import { InfoTip } from "@/components/info-tip";
import { Panel } from "@/components/panel";
import { AGENTS } from "@/lib/agents";
import { STAGE_DESCRIPTION, STAGE_LABEL, STAGE_ORDER } from "@/lib/labels";
import { liveMapState } from "@/lib/live-map";
import type { Feed } from "@/lib/run-feed";
import { cn } from "@/lib/utils";

import { AgentMarker, ArchitectureDiagram } from "./architecture-diagram";
import { CountUp } from "./count-up";

/*
 * A project run in progress, shown as the application being read. First the
 * workspaces arrive, one card each. Then they settle into the architecture.
 * Then the agents move over it: each sits on the part it is reading, and a
 * finding lands on its part. Everything here comes from the run's events.
 */

const glide = { duration: 0.6, ease: EASE };

/** A panel, or nothing at all when the map sits in a card of its own. */
function Frame({
  bare,
  children,
  ...props
}: { bare: boolean; children: React.ReactNode } & Record<
  `data-${string}`,
  string
>) {
  return bare ? (
    <div {...props}>{children}</div>
  ) : (
    <Panel {...props}>{children}</Panel>
  );
}

const AGENT_STATE = {
  pending: "Waiting",
  running: "Reading",
  done: "Done",
  failed: "Failed",
  declined: "Declined",
} as const;

export function LiveMap({
  feed,
  expected,
  bare = false,
}: {
  feed: Feed;
  /** The workspaces the run will read, known before any has arrived. */
  expected: { name: string; label: string }[];
  /**
   * Inside a card that already names the stage and lists the agents: just
   * the map, with no frame, header or agent row of its own.
   */
  bare?: boolean;
}) {
  const state = liveMapState(feed);
  const stage =
    STAGE_ORDER.find((name) => feed.stages[name].state === "running") ?? null;
  const arrived = new Set(feed.workspaces.map((item) => item.name));
  const architecture = feed.architecture;
  const several = expected.length > 1;

  return (
    <LayoutGroup>
      <Frame bare={bare} data-testid="live-map" data-stage={stage ?? "idle"}>
        {bare ? null : (
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-3 sm:px-6">
            <p className="flex min-w-0 items-center gap-2.5 text-sm">
              {stage ? (
                <LoaderCircle
                  className="size-4 shrink-0 animate-spin text-brand"
                  aria-hidden="true"
                />
              ) : null}
              <span className="font-medium">
                {stage ? STAGE_LABEL[stage] : "Starting"}
              </span>
              <span className="truncate text-muted-foreground">
                {stage ? STAGE_DESCRIPTION[stage] : ""}
              </span>
              <InfoTip about="liveMap" label="The live map" />
            </p>
            <p className="flex items-baseline gap-2 text-sm text-muted-foreground">
              <CountUp
                value={state.findings}
                className="font-mono text-base text-foreground"
                data-testid="live-map-findings"
              />
              {state.findings === 1 ? "finding so far" : "findings so far"}
            </p>
          </header>
        )}

        <div className={bare ? "" : "px-4 py-6 sm:px-6"}>
          {architecture ? (
            <ArchitectureDiagram
              components={architecture.components.map((component) => ({
                id: component.id,
                name: component.name,
                kind: component.kind,
                workspace: component.workspace,
                description: component.description,
                issues: state.components[component.id]?.findings ?? 0,
                worst: state.components[component.id]?.worst ?? null,
              }))}
              connections={architecture.connections}
              showWorkspace={several}
              agentsAt={Object.fromEntries(
                Object.entries(state.components).map(([id, item]) => [
                  id,
                  item.agents,
                ]),
              )}
            />
          ) : (
            <ul
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="live-map-workspaces"
            >
              {expected.map((workspace) => {
                const here = arrived.has(workspace.name);
                return (
                  <motion.li
                    key={workspace.name}
                    layout
                    animate={{ opacity: here ? 1 : 0.45 }}
                    transition={glide}
                    data-arrived={here}
                    className="flex min-h-15 items-center gap-3 rounded-card border bg-card px-3 py-2"
                  >
                    <FolderGit2
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {workspace.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {workspace.label}
                      </span>
                    </span>
                    {here ? (
                      <Check className="size-4 text-ok" aria-label="Fetched" />
                    ) : (
                      <LoaderCircle
                        className="size-4 animate-spin text-muted-foreground"
                        aria-label="Fetching"
                      />
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>

        {/* The agents: here when they are not on a part of the map. */}
        {bare ? null : (
          <footer className="grid gap-x-6 gap-y-2 border-t px-4 py-3 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
            {AGENTS.map((agent) => {
              const live = feed.agents[agent.id];
              const idle = state.idle.includes(agent.id);
              return (
                <div
                  key={agent.id}
                  className="flex min-w-0 items-center gap-2 text-xs"
                  data-testid="live-map-agent"
                  data-status={live.status}
                >
                  <span className="grid size-5 shrink-0 place-items-center">
                    {idle ? (
                      <AgentMarker
                        agentId={agent.id}
                        className={cn(
                          live.status !== "running" &&
                            "bg-muted text-muted-foreground",
                        )}
                      />
                    ) : (
                      <span className="size-1.5 rounded-full bg-brand" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {agent.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {live.status === "running" && live.reading
                        ? live.reading
                        : live.status === "done"
                          ? `Done · ${live.findings} filed`
                          : AGENT_STATE[live.status]}
                    </span>
                  </span>
                </div>
              );
            })}
          </footer>
        )}
      </Frame>
    </LayoutGroup>
  );
}
