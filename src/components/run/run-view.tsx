"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Boxes,
  Braces,
  ClipboardList,
  FileDown,
  FileText,
  FolderKanban,
  Layers,
  LayoutList,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Link2,
  Network,
  PencilLine,
  Radio,
  RotateCcw,
  Trophy,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Panel } from "@/components/panel";
import { pillClass } from "@/components/pill";
import { ArchitectureDiagram } from "@/components/project/architecture-diagram";
import { LocalTime } from "@/components/local-time";
import { LiveMap } from "@/components/project/live-map";
import { agentStates, applyEvent, emptyFeed, type Feed } from "@/lib/run-feed";
import { crewOf } from "@/lib/viz/crew";
import { nextRunsOf } from "@/lib/viz/next";
import { resultOf } from "@/lib/viz/result";
import { storyOf } from "@/lib/viz/story";
import { applyTime, emptyTimes, type RunTimes } from "@/lib/viz/times";
import type { VersionChanges } from "@/lib/viz/refine";
import {
  type Architecture,
  stagesOf,
  type RunRecord,
  type RunStatus,
  type RunSummary,
  type StoredEvent,
} from "@/server/engine/schema";

import { ConfirmRunDialog, type RunCost } from "./confirm-run";
import { CrewHeader } from "./crew/parts";
import { WindTunnel } from "./crew/wind-tunnel";
import { LatestFinding, LiveFindings } from "./live-findings";
import { ChainsReport } from "./kinds/chains-report";
import { DogfightReport } from "./kinds/dogfight-report";
import { EngineOutReport } from "./kinds/engineout-report";
import { PreflightReport } from "./kinds/preflight-report";
import { ResultCard } from "./result-card";
import { RunHeader } from "./run-header";
import { DeleteRunButton } from "./run-delete";
import { ActivityRail } from "./activity-rail";
import {
  BlackboxReport,
  CrosswindReport,
  FlyoffReport,
} from "./kinds/kind-report";
import { RefineSheet } from "./refine/refine-sheet";
import { RequirementDiff, VersionSwitcher } from "./refine/versions";

import { Story } from "./story/story";
import { RunFocus } from "./story/focus";
import { StageProgress } from "./story/stage-progress";
import { Stepper } from "./story/stepper";
import type { TrackedState } from "@/components/issues/state-chip";
import { Insights } from "./insights/insights";
import { ModelTab, ScoreboardTab, WorkOrdersTab } from "./run-report";

// The events after which the saved run has something new worth fetching.
const REFRESH_ON = new Set([
  "stage.completed",
  "agent.completed",
  "actor.completed",
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
  const [times, setTimes] = useState<RunTimes>(emptyTimes);
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
      setTimes((current) => applyTime(current, stored.event, stored.at));
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

  return { run, feed, times, connected };
}

/** Starts a new run with the same requirement and files, and opens it. */
/** "owner/name" for GitHub, the folder for a local one. */
const originText = (source: NonNullable<RunRecord["source"]>) =>
  source.origin.kind === "github"
    ? (/github\.com\/([^/]+\/[^/.]+)/.exec(source.origin.url)?.[1] ??
      source.origin.url)
    : source.origin.name;

function RunAgain({ run, cost }: { run: RunRecord; cost: RunCost }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: run.projectId,
          requirement: run.requirement,
          documents: run.documents,
          // A run of code reads the same workspaces again.
          ...(run.source ? { workspaces: run.workspaces } : {}),
        }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (response.ok && body.id) {
        router.push(`/app/runs/${body.id}`);
        return;
      }
      setError(body.error ?? "The run could not be started.");
    } catch {
      setError("Could not reach the server.");
    }
    setStarting(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={starting}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="run-again"
      >
        {starting ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
        Run Again
      </Button>
      <ConfirmRunDialog
        open={open}
        onOpenChange={setOpen}
        title="Run this again?"
        cost={cost}
        starting={starting}
        error={error}
        onConfirm={start}
      />
    </>
  );
}

const noSubscribe = () => () => undefined;

const RUN_TABS = [
  "summary",
  "impact",
  "report",
  "map",
  "findings",
  "chains",
  "work-orders",
  "model",
  "activity",
  "scoreboard",
] as const;
type RunTab = (typeof RUN_TABS)[number];

/** What the report's right column needs from beyond the run itself. */
export interface RunContext {
  /** The run's project, for the breadcrumb. */
  projectName?: string | null;
  /** The project's previous finished run, for "What changed". */
  previous: RunSummary | null;
  previousSeverity: { critical: number; high: number } | null;
  /** Work orders of this run that reached 8090; null when not linked. */
  sent: number | null;
  /** Each issue's tracked state, by its group id, for a project run. */
  tracked: Record<string, TrackedState>;
  /** What a new run of this project costs. */
  cost: RunCost;
  /** A Black Box's map to draw the failing request on: the project's latest. */
  map?: Architecture | null;
  /** A requirement's versions, oldest first; empty for a code run. */
  versions: { id: string; number: number; status: RunStatus }[];
  /** The version this run refines, and what changed since it. */
  parent: {
    id: string;
    number: number;
    requirement: string;
    changes: VersionChanges | null;
  } | null;
}

export function RunView({
  initial,
  context = {
    previous: null,
    previousSeverity: null,
    sent: null,
    tracked: {},
    cost: "billed",
    versions: [],
    parent: null,
  },
}: {
  initial: RunRecord;
  context?: RunContext;
}) {
  const { run, feed, times, connected } = useRun(initial);
  const running = run.status === "running";
  const kind = run.kind ?? "audit";
  // Each kind has its own report: an audit's and a Crosswind run's come
  // from the design model on; a fly-off and a black box have their own.
  const hasReport =
    kind === "flyoff"
      ? Boolean(run.flyoff?.verdict)
      : kind === "blackbox"
        ? Boolean(run.triage)
        : kind === "engineout"
          ? Boolean(run.outage?.headline)
          : kind === "dogfight"
            ? run.dogfight?.held !== null && run.dogfight?.held !== undefined
            : kind === "preflight"
              ? Boolean(run.preflight?.lines.length)
              : run.designModel !== null;
  // The report waits for the end of the run; until then the story is it.
  const ended = !running;
  const chapters = storyOf(run, feed, times);
  const reportReady = hasReport && ended;
  const canMap = Boolean(
    run.source &&
    (running || (run.source.architecture?.components.length ?? 0) > 0),
  );
  const params = useSearchParams();
  const [tab, setTabState] = useState<RunTab>(() => {
    const asked = params.get("tab") as RunTab | null;
    return asked && RUN_TABS.includes(asked) ? asked : "summary";
  });
  // Focus mode lives in the address (?focus=1); it only turns on in the
  // browser, since the full-screen view is drawn into the body.
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const focus = mounted && params.get("focus") === "1";
  // When a run watched live ends, the server-side context (versions, what
  // changed since the version before) is read again.
  const startedLive = initial.status === "running";
  useEffect(() => {
    if (startedLive && run.status !== "running") router.refresh();
  }, [startedLive, run.status, router]);
  const setQuery = (change: (query: URLSearchParams) => void) => {
    const query = new URLSearchParams(params.toString());
    change(query);
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };
  const setFocus = (on: boolean) =>
    setQuery((query) => {
      if (on) query.set("focus", "1");
      else query.delete("focus");
    });
  const setTab = (next: RunTab) => {
    setTabState(next);
    setQuery((query) => {
      if (next === "summary") query.delete("tab");
      else query.set("tab", next);
      query.delete("focus");
    });
  };
  const openTab = (next: string) => setTab(next as RunTab);
  const liveMap =
    running && run.source && run.projectId ? (
      <LiveMap
        bare
        feed={feed}
        expected={
          run.source.workspaces ?? [
            {
              name: run.workspaces?.[0] ?? run.source.label,
              label: originText(run.source),
            },
          ]
        }
      />
    ) : null;
  const agents =
    kind === "audit" || kind === "crosswind"
      ? agentStates(feed, run.agents)
      : null;
  const doneStages = chapters.filter((item) => item.state === "done").length;
  const architecture = run.source?.architecture ?? null;
  const crew = crewOf(feed, {
    kind,
    stages: stagesOf(run),
    subject: context.projectName ?? run.title,
    status: run.status,
  });

  // Three sections: the live view or the result, the details, the activity.
  // The details are the run's other tabs, in a second row of pills.
  const audits = kind === "audit" || kind === "crosswind";
  const details: {
    id: RunTab;
    label: string;
    icon: LucideIcon;
    count?: number;
  }[] = [];
  if (reportReady && kind === "crosswind") {
    details.push({ id: "impact", label: "Impact", icon: Wind });
  }
  if (
    reportReady &&
    (kind === "flyoff" ||
      kind === "blackbox" ||
      kind === "engineout" ||
      kind === "dogfight" ||
      kind === "preflight")
  ) {
    details.push({
      id: "report",
      label:
        kind === "flyoff"
          ? "Blueprints"
          : kind === "engineout"
            ? "Cascade"
            : kind === "dogfight"
              ? "Rounds"
              : kind === "preflight"
                ? "Spec"
                : "Incident",
      icon: FileText,
    });
  }
  if (reportReady && audits) {
    details.push(
      {
        id: "findings",
        label:
          kind === "crosswind"
            ? "What It Breaks"
            : run.source
              ? "Issues"
              : "Risks",
        icon: ListChecks,
        count: run.groups.length,
      },
      ...(run.chains && run.chains.length > 0
        ? [
            {
              id: "chains" as const,
              label: "Attack Chains",
              icon: Link2,
              count: run.chains.length,
            },
          ]
        : []),
      {
        id: "work-orders",
        label: "Work Orders",
        icon: ClipboardList,
        count: run.workOrders.length,
      },
    );
  }
  if (canMap) details.push({ id: "map", label: "Map", icon: Network });
  if (reportReady && audits) {
    details.push(
      { id: "model", label: "Model", icon: Boxes },
      { id: "scoreboard", label: "Scoreboard", icon: Trophy },
    );
  }
  const inDetails = details.some((item) => item.id === tab);
  // A tab asked for in the address that this run does not have yet.
  // While the run goes on there is one view, the live one; the tabs come
  // with its end.
  const shown: RunTab =
    !running && (tab === "activity" || inDetails) ? tab : "summary";
  const section =
    shown === "activity" ? "activity" : inDetails ? "details" : "summary";

  const tabs = (
    <div className="space-y-2">
      <nav className="flex flex-wrap gap-1" aria-label="Run sections">
        <button
          type="button"
          className={pillClass(section === "summary")}
          aria-current={section === "summary" ? "page" : undefined}
          onClick={() => setTab("summary")}
          data-testid="run-tab-summary"
        >
          {running ? <Radio /> : <LayoutList />}
          {running ? "Live" : "Result"}
        </button>
        {details.length > 0 ? (
          <button
            type="button"
            className={pillClass(section === "details")}
            aria-current={section === "details" ? "page" : undefined}
            onClick={() => setTab(details[0].id)}
            data-testid="run-tab-details"
          >
            <Layers />
            Details
          </button>
        ) : null}
        <button
          type="button"
          className={pillClass(section === "activity")}
          aria-current={section === "activity" ? "page" : undefined}
          onClick={() => setTab("activity")}
          data-testid="run-tab-activity"
        >
          <Activity />
          Activity
        </button>
      </nav>
      {section === "details" ? (
        <nav
          className="flex flex-wrap gap-1 border-t pt-2"
          aria-label="Details"
        >
          {details.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={pillClass(shown === item.id, true)}
                aria-current={shown === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
                data-testid={`run-tab-${item.id}`}
              >
                <Icon />
                {item.label}
                {item.count !== undefined ? (
                  <span className="font-mono text-[0.6875rem] text-muted-foreground">
                    {item.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );

  const icon = buttonVariants({ variant: "ghost", size: "icon-sm" });
  const tools = !running ? (
    <>
      {run.projectId ? (
        <Link
          href={`/app/projects/${run.projectId}`}
          data-testid="run-open-project"
          title="Project Cockpit"
          aria-label="Project Cockpit"
          className={icon}
        >
          <FolderKanban />
        </Link>
      ) : null}
      <a
        href={`/api/runs/${run.id}/export?format=md`}
        download
        data-testid="run-export-markdown"
        title="Download as Markdown"
        aria-label="Download as Markdown"
        className={icon}
      >
        <FileDown />
      </a>
      <a
        href={`/api/runs/${run.id}/export?format=json`}
        download
        data-testid="run-export-json"
        title="Download as JSON"
        aria-label="Download as JSON"
        className={icon}
      >
        <Braces />
      </a>
      <DeleteRunButton runId={run.id} compact />
    </>
  ) : null;

  const actions =
    !running && run.projectId && kind === "audit" ? (
      run.source ? (
        <RunAgain run={run} cost={context.cost} />
      ) : (
        <RefineSheet
          run={run}
          cost={context.cost}
          nextNumber={
            Math.max(1, ...context.versions.map((item) => item.number)) + 1
          }
        >
          <Button size="sm" data-testid="run-refine">
            <PencilLine />
            Refine Requirement
          </Button>
        </RefineSheet>
      )
    ) : null;

  const dot = <span aria-hidden="true">·</span>;
  const subtitle = (
    <>
      {run.sample ? <span>Sample run</span> : null}
      {run.sample ? dot : null}
      {kind === "audit" && !run.source ? (
        <span>Tests an idea: every risk is probable</span>
      ) : null}
      {kind === "audit" && !run.source ? dot : null}
      <span data-testid="run-source">
        {run.source
          ? run.source.workspaces
            ? `${run.source.workspaces.length} workspaces`
            : `${run.workspaces?.[0] ? `${run.workspaces[0]} · ` : ""}${originText(run.source)}`
          : kind === "flyoff"
            ? "Designs for a requirement"
            : "Requirement run"}
      </span>
      {run.source?.files != null ? (
        <>
          {dot}
          <span>
            {run.source.files.toLocaleString("en")} files
            {run.source.languages.length > 0
              ? ` · ${run.source.languages.join(" ")}`
              : ""}
          </span>
        </>
      ) : null}
      {dot}
      <LocalTime iso={run.createdAt} />
      {context.versions.length > 1 ? (
        <VersionSwitcher versions={context.versions} current={run.id} />
      ) : null}
    </>
  );

  return (
    <div className="space-y-5" data-testid="run-view" data-status={run.status}>
      <Tabs value={shown} onValueChange={(next) => setTab(next as RunTab)}>
        <RunHeader
          run={run}
          times={times}
          projectName={context.projectName ?? null}
          subtitle={subtitle}
          agents={agents}
          stageAt={
            // The wind tunnel and its rail say this, where they are shown.
            section === "summary"
              ? null
              : `Stage ${Math.min(doneStages + (running ? 1 : 0), chapters.length)}/${chapters.length}`
          }
          tools={tools}
          actions={actions}
          tabs={tabs}
          minimal={running}
        />

        {running && !connected ? (
          <Alert data-testid="run-reconnecting" className="mt-5">
            <AlertDescription>
              Lost the connection to the server. Reconnecting; the run goes on.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-5" id="run-report">
          <TabsContent value="summary">
            <div className="space-y-5">
              {ended ? (
                <ResultCard
                  result={resultOf(run)}
                  onOpen={openTab}
                  next={nextRunsOf(run)}
                />
              ) : null}
              {/* One panel, with no lines across it: what is happening, the
                  wind tunnel, the newest finding, and the stages as a rail
                  along its foot. */}
              <Panel className="overflow-hidden" data-testid="run-crew">
                {running ? (
                  // While the run goes on: one large sentence, and nothing
                  // else to read above the tunnel.
                  <p
                    className="relative z-10 px-6 pt-9 text-center text-2xl leading-snug font-semibold tracking-[-0.02em] text-balance md:text-3xl"
                    aria-live="polite"
                    data-testid="run-now"
                  >
                    {crew.sentence}
                  </p>
                ) : (
                  <div className="relative z-10 px-5 pt-5 pb-3 md:px-6 md:pt-6">
                    <CrewHeader crew={crew} />
                  </div>
                )}
                <WindTunnel
                  crew={crew}
                  subject={context.projectName ?? run.title}
                  workspaces={run.workspaces ?? []}
                />
                {running ? (
                  <>
                    <LatestFinding feed={feed} />
                    <StageProgress chapters={chapters} />
                  </>
                ) : (
                  // Once it has ended: every stage, with its time.
                  <div className="hidden lg:block">
                    <Stepper
                      variant="rail"
                      chapters={chapters}
                      onSelect={() => setTab("activity")}
                    />
                  </div>
                )}
              </Panel>
              {running ? <LiveFindings feed={feed} /> : null}
              {(run.requirement &&
                (run.requirement !== run.title || run.documents.length > 0)) ||
              context.parent ? (
                <Panel className="space-y-3 px-4 py-3 text-[0.8125rem]">
                  {run.requirement &&
                  (run.requirement !== run.title ||
                    run.documents.length > 0) ? (
                    <details>
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
                  {context.parent ? (
                    <details>
                      <summary
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                        data-testid="run-requirement-changes"
                      >
                        What changed in the text since version{" "}
                        {context.parent.number}
                      </summary>
                      <div className="mt-3">
                        <RequirementDiff
                          before={context.parent.requirement}
                          after={run.requirement}
                        />
                      </div>
                    </details>
                  ) : null}
                </Panel>
              ) : null}
            </div>
          </TabsContent>

          {canMap ? (
            <TabsContent value="map">
              <Panel className="relative overflow-hidden p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {running
                      ? "What the agents are reading, live."
                      : "The application as the model read it."}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFocus(true)}
                    data-testid="run-focus-open"
                  >
                    <Maximize2 />
                    Focus
                  </Button>
                </div>
                {running ? (
                  liveMap
                ) : architecture ? (
                  <ArchitectureDiagram
                    components={architecture.components.map((item) => ({
                      id: item.id,
                      name: item.name,
                      kind: item.kind,
                      workspace: item.workspace,
                      description: item.description,
                      issues: 0,
                      worst: null,
                    }))}
                    connections={architecture.connections}
                    showWorkspace={Boolean(run.source?.workspaces)}
                  />
                ) : null}
              </Panel>
            </TabsContent>
          ) : null}

          {reportReady && kind === "crosswind" ? (
            <TabsContent value="impact">
              <CrosswindReport run={run} />
            </TabsContent>
          ) : null}
          {reportReady && kind === "flyoff" ? (
            <TabsContent value="report">
              <FlyoffReport run={run} />
            </TabsContent>
          ) : null}
          {reportReady && kind === "blackbox" ? (
            <TabsContent value="report">
              <BlackboxReport
                run={run}
                tracked={context.tracked}
                map={context.map ?? null}
              />
            </TabsContent>
          ) : null}
          {reportReady && kind === "engineout" ? (
            <TabsContent value="report">
              <EngineOutReport run={run} />
            </TabsContent>
          ) : null}
          {reportReady && kind === "preflight" ? (
            <TabsContent value="report">
              <PreflightReport run={run} />
            </TabsContent>
          ) : null}
          {reportReady && kind === "dogfight" ? (
            <TabsContent value="report">
              <DogfightReport run={run} />
            </TabsContent>
          ) : null}
          {reportReady && (kind === "audit" || kind === "crosswind") ? (
            <>
              <TabsContent value="findings">
                <Insights run={run} context={context} onOpen={openTab} />
              </TabsContent>
              <TabsContent value="chains">
                <ChainsReport run={run} />
              </TabsContent>
              <TabsContent value="work-orders">
                <WorkOrdersTab run={run} />
              </TabsContent>
              <TabsContent value="model">
                <ModelTab run={run} />
              </TabsContent>
              <TabsContent value="scoreboard">
                <ScoreboardTab run={run} times={times} />
              </TabsContent>
            </>
          ) : null}

          <TabsContent value="activity">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <Story
                probable={!run.source}
                chapters={chapters}
                feed={feed}
                times={times}
                onOpen={openTab}
                liveMap={liveMap}
              />
              <ActivityRail
                chapters={chapters}
                feed={feed}
                showAgents={kind === "audit" || kind === "crosswind"}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {focus ? (
        <RunFocus
          run={run}
          chapters={chapters}
          feed={feed}
          times={times}
          liveMap={liveMap}
          onExit={() => setFocus(false)}
          onOpen={openTab}
        />
      ) : null}
    </div>
  );
}
