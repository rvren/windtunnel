import { Suspense } from "react";
import Link from "next/link";
import { LoaderCircle, Plus } from "lucide-react";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { Mark } from "@/components/brand/logo";
import { FEATURE_ICON } from "@/components/feature-icon";
import { LocalTime } from "@/components/local-time";
import { Panel } from "@/components/panel";
import {
  RunCheck,
  RunCheckAll,
  RunSelection,
} from "@/components/run/run-delete";
import { Pager } from "@/components/pager";
import { RunFilters } from "@/components/run/run-filters";
import { SeverityBar } from "@/components/severity-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { pillClass } from "@/components/pill";
import { buttonVariants } from "@/components/ui/button";
import { formatCost } from "@/lib/cost";
import { RUN_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { pageOf } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import {
  kindCounts,
  runRow,
  runsTotals,
  type RunRow,
} from "@/lib/viz/runs-list";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import {
  RUN_KINDS,
  type RunKind,
  type RunSummary,
} from "@/server/engine/schema";
import { listProjects, type Project } from "@/server/projects/store";

async function RunsTable({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const projectId = typeof query.project === "string" ? query.project : null;
  const picked = [query.workspace ?? []].flat();
  const kind = RUN_KINDS.includes(query.kind as RunKind)
    ? (query.kind as RunKind)
    : null;
  let runs: RunSummary[];
  let projects: Project[];
  let any: boolean;
  try {
    await ensureDatabase();
    projects = await listProjects();
    const known = projects.some((item) => item.id === projectId);
    runs = await runStore().list({
      projectId: known ? projectId! : undefined,
      workspaces: picked,
    });
    any = runs.length > 0 || (await runStore().list()).length > 0;
  } catch {
    return (
      <Alert variant="destructive" data-testid="runs-database-down">
        <AlertTitle>The database is not reachable</AlertTitle>
        <AlertDescription>
          Start it with `docker compose up -d db`, then reload this page.
        </AlertDescription>
      </Alert>
    );
  }

  if (!any) {
    return (
      <div
        className="flex flex-col items-center rounded-card border border-dashed px-6 py-16 text-center"
        data-testid="runs-empty"
      >
        <Mark className="size-10" />
        <h2 className="mt-5 text-lg font-medium">Start your first run</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Give Windtunnel a requirement or a project&apos;s code. Five agents
          test it and report what fails.
        </p>
        <Link
          href="/app/runs/new"
          data-testid="runs-empty-new-run"
          className={buttonVariants({ className: "mt-6" })}
        >
          <Plus />
          New Run
        </Link>
      </div>
    );
  }

  // The kinds present, counted before the kind filter, so each pill says
  // how many runs it would show.
  const kinds = kindCounts(runs);
  const everyKind = runs.length;
  if (kind) runs = runs.filter((run) => run.kind === kind);
  /** The list's address with these filters; a new filter starts at page 1. */
  const hrefFor = (next: RunKind | null, page = 1) => {
    const params = new URLSearchParams();
    if (projectId) params.set("project", projectId);
    for (const name of picked) params.append("workspace", name);
    if (next) params.set("kind", next);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return text ? `/app/runs?${text}` : "/app/runs";
  };
  const shown = pageOf(runs, query.page);
  const nameOf = new Map(projects.map((item) => [item.id, item.name]));
  // Ticking "all" ticks the runs on this page: never runs out of sight.
  const deletable = shown.items
    .filter((run) => run.status !== "running")
    .map((run) => run.id);
  const current = projects.find((item) => item.id === projectId);
  const totals = runsTotals(runs);
  return (
    <>
      <RunFilters
        projects={projects.map(({ id, name, workspaces, demo }) => ({
          id,
          name,
          workspaces: workspaces.length,
          demo,
        }))}
        workspaces={current?.workspaces.map((item) => item.name) ?? []}
      />
      {kinds.length > 1 ? (
        <nav
          aria-label="Kind of run"
          className="mb-3 flex flex-wrap gap-1"
          data-testid="runs-kinds"
        >
          <Link
            href={hrefFor(null)}
            aria-current={kind === null ? "page" : undefined}
            className={pillClass(kind === null, true)}
            data-testid="runs-kind-all"
          >
            All kinds
            <span className="font-mono text-[0.6875rem] text-muted-foreground">
              {everyKind}
            </span>
          </Link>
          {kinds.map((item) => {
            const Icon = FEATURE_ICON[item.kind];
            return (
              <Link
                key={item.kind}
                href={hrefFor(item.kind)}
                aria-current={kind === item.kind ? "page" : undefined}
                className={pillClass(kind === item.kind, true)}
                data-testid={`runs-kind-${item.kind}`}
              >
                <Icon aria-hidden="true" />
                {item.label}
                <span className="font-mono text-[0.6875rem] text-muted-foreground">
                  {item.count}
                </span>
              </Link>
            );
          })}
        </nav>
      ) : null}
      <RunSelection ids={deletable}>
        <Panel data-testid="runs-table">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5">
            <label className="flex items-center gap-3 text-[0.8125rem] font-medium">
              <RunCheckAll ids={deletable} />
              {current ? current.name : "All runs"}
            </label>
            <p
              className="ml-auto flex flex-wrap gap-x-3 font-mono text-[0.6875rem] text-muted-foreground tabular-nums"
              data-testid="runs-totals"
            >
              <span>
                {totals.runs} {totals.runs === 1 ? "run" : "runs"}
              </span>
              {totals.running > 0 ? (
                <span className="text-brand">{totals.running} running</span>
              ) : null}
              <span>{totals.findings} findings</span>
              <span>{formatCost(totals.spent)} spent</span>
            </p>
          </div>
          {runs.length === 0 ? (
            <p
              className="py-10 text-center text-[0.8125rem] text-muted-foreground"
              data-testid="runs-none-match"
            >
              No run matches these filters.
            </p>
          ) : (
            // One grid for the whole list, each row on its subgrid, so every
            // column lines up from row to row. Below xl the time and the
            // cost move under the title.
            <ul className="divide-y md:grid md:grid-cols-[1rem_8rem_minmax(12rem,1fr)_minmax(9rem,auto)_auto] md:gap-x-6 xl:grid-cols-[1rem_9rem_minmax(14rem,1fr)_minmax(10rem,auto)_auto_auto_auto]">
              <li
                aria-hidden="true"
                className="hidden px-4 py-2 text-xs text-muted-foreground md:col-span-full md:grid md:grid-cols-subgrid"
              >
                <span />
                <span>Kind</span>
                <span>Run</span>
                <span>Result</span>
                <span className="text-right">Work orders</span>
                <span className="hidden text-right xl:block">Cost</span>
                <span className="hidden text-right xl:block">Started</span>
              </li>
              {shown.items.map((run) => (
                <RunRowItem
                  key={run.id}
                  run={run}
                  projectName={
                    run.projectId ? nameOf.get(run.projectId) : undefined
                  }
                />
              ))}
            </ul>
          )}
          <Pager
            page={shown}
            noun={["run", "runs"]}
            href={(page) => hrefFor(kind, page)}
            testId="runs-pager"
          />
        </Panel>
      </RunSelection>
    </>
  );
}

const STATUS_TEXT: Record<RunSummary["status"], string> = {
  running: "text-brand",
  completed: "text-muted-foreground",
  failed: "text-sev-critical",
  interrupted: "text-sev-high",
};

const STATUS_DOT: Record<RunSummary["status"], string> = {
  running: "bg-brand",
  completed: "bg-ok",
  failed: "bg-sev-critical",
  interrupted: "bg-sev-high",
};

function RunRowItem({
  run,
  projectName,
}: {
  run: RunSummary;
  projectName?: string;
}) {
  const row = runRow(run, projectName);
  const time = <LocalTime iso={run.createdAt} className="whitespace-nowrap" />;
  return (
    <li
      className="relative grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors duration-200 hover:bg-muted/40 md:col-span-full md:grid-cols-subgrid"
      data-testid="runs-row"
    >
      <span className="relative z-10 flex">
        <RunCheck
          id={run.id}
          title={row.title}
          disabled={run.status === "running"}
        />
      </span>

      <KindCell kind={row.kind} probable={row.probable} />

      <div className="col-span-2 min-w-0 md:col-span-1">
        <KindCell kind={row.kind} probable={row.probable} small />
        <div className="flex min-w-0 items-center gap-2">
          {run.status === "running" ? (
            <LoaderCircle
              className="size-3 shrink-0 animate-spin text-brand"
              aria-hidden="true"
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                STATUS_DOT[run.status],
              )}
            />
          )}
          {/* The title link covers the row; the checkbox and the project
              link sit above it. */}
          <Link
            href={`/app/runs/${run.id}`}
            data-testid="runs-row-link"
            className="truncate text-sm font-medium outline-none after:absolute after:inset-0 hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {row.title}
          </Link>
        </div>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 pl-3.5 text-xs text-muted-foreground">
          {projectName ? (
            <Link
              href={`/app/projects/${run.projectId}`}
              data-testid="runs-row-project"
              className="relative z-10 hover:text-foreground hover:underline"
            >
              {projectName}
            </Link>
          ) : (
            <span>No project</span>
          )}
          {row.workspaces.shown.length > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span
                className="font-mono text-[0.6875rem]"
                title={run.workspaces.join(", ")}
              >
                {row.workspaces.shown.join(", ")}
                {row.workspaces.more > 0 ? ` +${row.workspaces.more}` : ""}
              </span>
            </>
          ) : null}
          {run.status !== "completed" ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={STATUS_TEXT[run.status]}>
                {row.step ?? RUN_STATUS_LABEL[run.status]}
              </span>
            </>
          ) : null}
          <span aria-hidden="true" className="xl:hidden">
            ·
          </span>
          <span className="xl:hidden">{time}</span>
          {run.costUsd !== null ? (
            <span className="font-mono text-[0.6875rem] xl:hidden">
              · {formatCost(run.costUsd)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="col-start-2 min-w-0 md:col-start-auto">
        <Findings run={run} probable={row.probable} result={row.result} />
      </div>

      <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
        <span className="text-foreground">{run.workOrderCount}</span>
        <span className="md:hidden"> work orders</span>
      </span>

      <span className="hidden text-right font-mono text-xs text-muted-foreground tabular-nums xl:block">
        {formatCost(run.costUsd)}
      </span>

      <span className="hidden text-right text-xs text-muted-foreground xl:block">
        {time}
      </span>
    </li>
  );
}

/**
 * The kind of run, with its icon: a column of its own on wider screens,
 * and a small line over the title on a phone.
 */
function KindCell({
  kind,
  probable,
  small = false,
}: {
  kind: RunRow["kind"];
  probable: boolean;
  small?: boolean;
}) {
  const Icon = FEATURE_ICON[kind.id];
  if (small) {
    return (
      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground md:hidden">
        <Icon className="size-3.5" aria-hidden="true" />
        {kind.label}
        {kind.detail ? ` · ${kind.detail}` : ""}
      </p>
    );
  }
  return (
    <div
      className="hidden min-w-0 items-start gap-2 md:flex"
      data-testid="runs-row-kind"
      data-kind={kind.id}
      title={
        probable ? "Tests an idea: its findings are probable risks." : undefined
      }
    >
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block truncate text-[0.8125rem]">{kind.label}</span>
        {kind.detail ? (
          <span className="block text-xs text-muted-foreground">
            {kind.detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * What a run came to: a bar by severity of what it found, a count of
 * risks, the issue a Dogfight defended, or a Fly-off's pick.
 */
function Findings({
  run,
  probable,
  result,
}: {
  run: RunSummary;
  probable: boolean;
  result: RunRow["result"];
}) {
  if (run.status === "running") {
    return <span className="text-xs text-muted-foreground">In progress</span>;
  }
  if (result === "picked") {
    return (
      <span className="text-xs text-muted-foreground">
        {run.status === "completed" ? "Design picked" : "No design picked"}
      </span>
    );
  }
  if (result === "defended" && run.findingCount > 0) {
    const worst = SEVERITY_ORDER.find(
      (severity) => (run.counts?.[severity] ?? 0) > 0,
    );
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {worst ? (
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ background: SEVERITY_TONE[worst] }}
          />
        ) : null}
        {worst ? `${SEVERITY_LABEL[worst]} issue defended` : "Issue defended"}
      </span>
    );
  }
  if (run.findingCount === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {probable ? "No risks" : "No findings"}
      </span>
    );
  }
  if (probable || !run.counts) {
    return (
      <span className="text-xs text-muted-foreground">
        <span className="font-mono text-foreground tabular-nums">
          {run.findingCount}
        </span>{" "}
        {probable
          ? run.findingCount === 1
            ? "probable risk"
            : "probable risks"
          : run.findingCount === 1
            ? "finding"
            : "findings"}
      </span>
    );
  }
  return (
    <SeverityBar
      counts={run.counts}
      label={`${run.title}: findings by severity`}
    />
  );
}

export default function RunsPage({ searchParams }: PageProps<"/app/runs">) {
  return (
    <>
      <PageHeader
        title="Runs"
        description="Every run, newest first. Each belongs to a project."
      >
        <Link
          href="/app/runs/new"
          data-testid="runs-new-run"
          className={buttonVariants()}
        >
          <Plus />
          New Run
        </Link>
      </PageHeader>
      <Suspense fallback={<PageLoading label="Reading the runs" />}>
        <RunsTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}
