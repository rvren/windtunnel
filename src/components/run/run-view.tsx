"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalTime } from "@/components/local-time";
import { FadeIn } from "@/components/motion";
import { applyEvent, emptyFeed, type Feed } from "@/lib/run-feed";
import type { RunRecord, StoredEvent } from "@/server/engine/schema";

import { SampleBadge, StatusBadge } from "./badges";
import { AgentLanes, StageRail } from "./run-progress";
import {
  FindingsTab,
  ModelTab,
  ScoreboardTab,
  WorkOrdersTab,
} from "./run-report";

// The events after which the saved run has something new worth fetching.
const REFRESH_ON = new Set([
  "stage.completed",
  "agent.completed",
  "agent.declined",
  "agent.failed",
  "run.completed",
  "run.failed",
]);

/**
 * Follows a run. The event stream replays what already happened and then
 * goes live, so the same code shows a run in progress, a finished run and a
 * page reloaded half-way. The stream drives the progress display; the saved
 * run is fetched again whenever a step that adds content has finished.
 */
function useRun(initial: RunRecord) {
  const [run, setRun] = useState(initial);
  const [feed, setFeed] = useState<Feed>(emptyFeed);
  const [connected, setConnected] = useState(true);
  const id = initial.id;

  useEffect(() => {
    let stopped = false;
    const source = new EventSource(`/api/runs/${id}/events`);

    const refresh = async () => {
      try {
        const response = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        setRun(((await response.json()) as { run: RunRecord }).run);
      } catch {
        // The next event tries again.
      }
    };

    source.onopen = () => setConnected(true);
    source.onmessage = (message) => {
      const stored = JSON.parse(message.data) as StoredEvent;
      setFeed((current) => applyEvent(current, stored.event));
      if (REFRESH_ON.has(stored.event.type)) void refresh();
    };
    // The server says "end" when nothing more will come.
    source.addEventListener("end", () => {
      source.close();
      void refresh();
    });
    // The browser reconnects by itself and resumes after the last event.
    source.onerror = () => setConnected(false);

    return () => {
      stopped = true;
      source.close();
    };
  }, [id]);

  return { run, feed, connected };
}

export function RunView({ initial }: { initial: RunRecord }) {
  const { run, feed, connected } = useRun(initial);
  const running = run.status === "running";
  const hasReport = run.designModel !== null;

  return (
    <div className="space-y-8" data-testid="run-view" data-status={run.status}>
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={run.status} />
          {run.sample ? <SampleBadge /> : null}
          <LocalTime
            iso={run.createdAt}
            className="font-mono text-xs text-muted-foreground"
          />
          {!running ? (
            <span className="ml-auto flex gap-2">
              <a
                href={`/api/runs/${run.id}/export?format=md`}
                download
                data-testid="run-export-markdown"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download />
                Markdown
              </a>
              <a
                href={`/api/runs/${run.id}/export?format=json`}
                download
                data-testid="run-export-json"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download />
                JSON
              </a>
            </span>
          ) : null}
        </div>
        <h1 className="max-w-4xl text-2xl leading-tight font-normal tracking-[-0.02em] text-balance sm:text-3xl">
          {run.title}
        </h1>
        {run.requirement !== run.title || run.documents.length > 0 ? (
          <details className="max-w-4xl text-sm">
            <summary
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              data-testid="run-requirement-toggle"
            >
              Requirement
              {run.documents.length > 0
                ? ` and ${run.documents.length} ${run.documents.length === 1 ? "file" : "files"}`
                : ""}
            </summary>
            <p className="mt-3 leading-relaxed whitespace-pre-wrap">
              {run.requirement}
            </p>
            {run.documents.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
                {run.documents.map((document) => (
                  <li
                    key={document.name}
                    className="rounded-md border px-2 py-1"
                  >
                    {document.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        ) : null}
      </header>

      {run.error ? (
        <Alert variant="destructive" data-testid="run-error">
          <AlertTitle>
            {run.status === "interrupted"
              ? "This run was interrupted"
              : "This run failed"}
          </AlertTitle>
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      ) : null}
      {running && !connected ? (
        <Alert data-testid="run-reconnecting">
          <AlertDescription>
            Lost the connection to the server. Reconnecting; the run goes on.
          </AlertDescription>
        </Alert>
      ) : null}

      <StageRail feed={feed} />
      <AgentLanes feed={feed} />

      {hasReport ? (
        <Tabs defaultValue="findings" className="gap-6">
          {/* The four tabs do not fit a phone: the strip scrolls sideways. */}
          <div className="overflow-x-auto">
            <TabsList className="w-max">
              <TabsTrigger
                value="findings"
                data-testid="run-tab-findings"
                className="flex-none px-4"
              >
                Findings
                <span className="font-mono text-xs text-muted-foreground">
                  {run.groups.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="work-orders"
                data-testid="run-tab-work-orders"
                className="flex-none px-4"
              >
                Work orders
                <span className="font-mono text-xs text-muted-foreground">
                  {run.workOrders.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="model"
                data-testid="run-tab-model"
                className="flex-none px-4"
              >
                Design model
              </TabsTrigger>
              <TabsTrigger
                value="scoreboard"
                data-testid="run-tab-scoreboard"
                className="flex-none px-4"
              >
                Scoreboard
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="findings">
            <FadeIn>
              <FindingsTab run={run} />
            </FadeIn>
          </TabsContent>
          <TabsContent value="work-orders">
            <FadeIn>
              <WorkOrdersTab run={run} />
            </FadeIn>
          </TabsContent>
          <TabsContent value="model">
            <FadeIn>
              <ModelTab run={run} />
            </FadeIn>
          </TabsContent>
          <TabsContent value="scoreboard">
            <FadeIn>
              <ScoreboardTab run={run} />
            </FadeIn>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
