import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  FolderGit2,
  GitBranch,
  GitMerge,
  History,
  LayoutDashboard,
  ListChecks,
  Play,
  Plus,
  Settings2,
  ShieldCheck,
  RotateCcw,
  Siren,
  Swords,
  Trash2,
  Wind,
} from "lucide-react";

import { PageLoading } from "@/components/app/page-header";
import { FEATURE_ICON } from "@/components/feature-icon";
import { LocalTime } from "@/components/local-time";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/paging";
import { runRow } from "@/lib/viz/runs-list";
import { Panel } from "@/components/panel";
import { Cockpit } from "@/components/project/cockpit";
import { ScheduleDialog } from "@/components/project/kind-dialogs";
import { formatCost } from "@/lib/cost";
import { cn } from "@/lib/utils";
import { spentThisMonth } from "@/server/schedule/scheduler";
import {
  AddWorkspaceDialog,
  DeleteProjectDialog,
  RemoveWorkspaceButton,
  RunProjectDialog,
} from "@/components/project/project-dialogs";
import { ProjectLink } from "@/components/connectors/project-link";
import { ProjectLive } from "@/components/project/project-live";
import { StatusBadge } from "@/components/run/badges";
import {
  RunCheck,
  RunCheckAll,
  RunSelection,
} from "@/components/run/run-delete";
import { RunFilters, WorkspaceChips } from "@/components/run/run-filters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SOFTWARE_FACTORY } from "@/server/connectors/software-factory";
import {
  getConnection,
  getProjectLink,
  listDeliveries,
} from "@/server/connectors/store";
import { ensureDatabase } from "@/server/db/ready";
import { localRepos } from "@/server/engine/repo/fetch";
import { runStore } from "@/server/engine/registry";
import { countsOf } from "@/server/engine/store";
import { sampleServiceOf } from "@/server/engine/sample-project";
import type { RunSummary } from "@/server/engine/schema";
import {
  buildCockpit,
  type Cockpit as CockpitData,
} from "@/server/projects/cockpit";
import { DEMO_REPOSITORIES } from "@/server/projects/demo";
import { getProject, type Project } from "@/server/projects/store";
import type { RunPoint } from "@/lib/viz/project";
import { trendPoint, trendRuns, type TrendPoint } from "@/lib/viz/trend";
import { IssueTrend } from "@/components/project/issue-trend";
import type { TrackedState } from "@/components/issues/state-chip";
import type { FixedIssue } from "@/components/project/cockpit";
import { ensureTracked, listIssues } from "@/server/issues/store";
import { PullRequestRefresher } from "@/components/issues/pr-refresher";
import { engineStatus } from "@/server/status";

export const metadata: Metadata = { title: "Project" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const picked = [query.workspace ?? []].flat();
  const asked = typeof query.tab === "string" ? query.tab : "overview";
  if (!UUID.test(id)) notFound();

  let project: Project | null;
  let runs: RunSummary[];
  let shownRuns: RunSummary[];
  let cockpit: CockpitData | null = null;
  let earlier: RunPoint[] = [];
  let trend: TrendPoint[] = [];
  // The project's tracked issues: each issue's state, by its group in the
  // cockpit's run, and the ones fixed.
  let tracked: Record<string, TrackedState> = {};
  let fixed: FixedIssue[] = [];
  let mergedCount = 0;
  try {
    await ensureDatabase();
    project = await getProject(id);
    runs = project ? await runStore().list({ projectId: id }) : [];
    shownRuns =
      project && picked.length > 0
        ? await runStore().list({ projectId: id, workspaces: picked })
        : runs;
    // The cockpit shows the latest finished run of the project's code: a
    // requirement run reads no code, so it has no components to draw. Only
    // a project with no code run yet shows its latest requirement run.
    // Only audits draw the cockpit: a Crosswind, fly-off or black box run
    // has its own report.
    const completed = runs.filter(
      (run) => run.status === "completed" && run.kind === "audit",
    );
    const finished =
      completed.find((run) => run.workspaces.length > 0) ?? completed[0];
    const record = finished ? await runStore().get(finished.id) : null;
    if (record) {
      cockpit = buildCockpit(record);
      // Older runs did not store their counts: read those runs once.
      const read = await Promise.all(
        trendRuns(runs, Boolean(record.source)).map(async (run) => {
          if (run.counts) return trendPoint(run, run.counts);
          const full =
            run.id === record.id ? record : await runStore().get(run.id);
          const counts = full ? countsOf(full) : null;
          return counts ? trendPoint(run, counts) : null;
        }),
      );
      trend = read.filter((point) => point !== null);
      earlier = runs
        .filter(
          (run) =>
            run.status === "completed" &&
            run.createdAt < record.createdAt &&
            run.kind === "audit" &&
            run.workspaces.length > 0 === Boolean(record.source),
        )
        .reverse()
        .map((run) => ({
          issues: run.findingCount,
          workOrders: run.workOrderCount,
        }));
      if (project) {
        await ensureTracked(project.id);
        const all = await listIssues(project.id);
        tracked = Object.fromEntries(
          all
            .filter((item) => item.lastRunId === record.id && item.lastGroupId)
            .map((item) => [
              item.lastGroupId!,
              {
                id: item.id,
                state: item.state,
                pr: item.pr,
                origin: item.origin,
              },
            ]),
        );
        mergedCount = all.filter((item) => item.state === "merged").length;
        fixed = all
          .filter((item) => item.state === "fixed")
          .map(({ id, title, severity, fixedAt, pr }) => ({
            id,
            title,
            severity,
            fixedAt,
            pr: pr ? { number: pr.number, url: pr.url } : null,
          }));
      }
    }
  } catch {
    return (
      <Alert variant="destructive">
        <AlertTitle>The database is not reachable</AlertTitle>
        <AlertDescription>
          Start it with `docker compose up -d db`, then reload this page.
        </AlertDescription>
      </Alert>
    );
  }
  if (!project) notFound();

  const [link, factory] = await Promise.all([
    getProjectLink(project.id, SOFTWARE_FACTORY),
    getConnection(SOFTWARE_FACTORY),
  ]);
  const connected = factory.status === "connected";
  // Work orders of the cockpit's run that reached 8090, when it is linked.
  const delivered =
    link && cockpit
      ? {
          sent: (await listDeliveries(cockpit.runId, SOFTWARE_FACTORY)).filter(
            (item) => item.status === "sent",
          ).length,
          total: cockpit.totals.workOrders,
        }
      : null;
  const status = await engineStatus();
  const blocked =
    !status.apiKey && !status.sampleMode
      ? "No API key is set. Add ANTHROPIC_API_KEY to .env.local and restart the server."
      : null;
  const folders = await localRepos();
  const githubToken = Boolean(process.env.GITHUB_TOKEN?.trim());
  const running = runs.find((run) => run.status === "running");
  const count = project.workspaces.length;
  const spentUsd = await spentThisMonth(project.id).catch(() => 0);
  const schedule = project.schedule;
  const kindButton = (
    kind: "crosswind" | "flyoff" | "blackbox",
    label: string,
    Icon: typeof Wind,
    needsCode: boolean,
  ) =>
    Boolean(running) || (needsCode && count === 0) ? (
      <Button
        variant="outline"
        size="sm"
        disabled
        data-testid={`project-start-${kind}`}
        title={label}
        aria-label={label}
      >
        <Icon />
        <span className="hidden xl:inline">{label}</span>
      </Button>
    ) : (
      <Link
        href={`/app/runs/new?kind=${kind}&project=${project.id}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
        data-testid={`project-start-${kind}`}
        title={label}
        aria-label={label}
      >
        <Icon />
        <span className="hidden xl:inline">{label}</span>
      </Link>
    );

  const addWorkspace = (label: string, primary = false) => (
    <AddWorkspaceDialog
      projectId={project.id}
      folders={folders}
      githubToken={githubToken}
      sampleRepos={
        project.demo
          ? DEMO_REPOSITORIES.filter(
              (repo) =>
                !project.workspaces.some(
                  (item) => sampleServiceOf(item.origin) === repo.name,
                ),
            )
          : []
      }
    >
      <Button
        variant={primary ? "default" : "outline"}
        size={primary ? "default" : "sm"}
        data-testid="project-add-workspace"
      >
        <Plus />
        {label}
      </Button>
    </AddWorkspaceDialog>
  );
  const runProject = (primary: boolean) => (
    <RunProjectDialog
      projectId={project.id}
      workspaces={count}
      blocked={project.demo ? null : blocked}
      sampleMode={status.sampleMode}
      sampleProject={project.demo}
    >
      <Button
        variant={primary ? "default" : "outline"}
        size="sm"
        disabled={count === 0 || Boolean(running)}
        data-testid="project-run"
      >
        <Play />
        Run Project
      </Button>
    </RunProjectDialog>
  );

  const tabs: {
    id: ProjectTab;
    label: string;
    icon: typeof Wind;
    count?: number;
  }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    ...(cockpit
      ? [
          {
            id: "issues" as const,
            label: cockpit.fromRequirement ? "Risks" : "Issues",
            icon: ListChecks,
            count: cockpit.totals.issues,
          },
        ]
      : []),
    ...(cockpit && !cockpit.fromRequirement
      ? [{ id: "security" as const, label: "Security", icon: ShieldCheck }]
      : []),
    { id: "runs", label: "Runs", icon: History, count: runs.length },
    { id: "setup", label: "Setup", icon: Settings2 },
  ];
  const tab: ProjectTab = tabs.some((item) => item.id === asked)
    ? (asked as ProjectTab)
    : "overview";

  return (
    <div className="space-y-5" data-testid="project-page">
      <Panel className="p-5 sm:p-6" data-testid="project-header">
        <div className="flex items-center justify-between gap-3">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground"
          >
            <Link href="/app/projects" className="hover:text-foreground">
              Projects
            </Link>
            <span aria-hidden="true">/</span>
            <span>{project.name}</span>
          </nav>
          <div className="-my-1 flex items-center gap-1">
            <ScheduleDialog
              projectId={project.id}
              schedule={schedule}
              spentUsd={spentUsd}
              free={project.demo}
            >
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[0.8125rem] text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="project-schedule"
                title={schedule.note ?? "Scheduled runs"}
              >
                <CalendarClock className="size-3.5" aria-hidden="true" />
                {schedule.note ? (
                  <span
                    className="size-1.5 rounded-full bg-sev-high"
                    aria-hidden="true"
                  />
                ) : null}
                {schedule.every === "off"
                  ? "Not scheduled"
                  : `${schedule.every === "daily" ? "Daily" : "Weekly"} at ${String(schedule.hour).padStart(2, "0")}:00`}
              </button>
            </ScheduleDialog>
            <DeleteProjectDialog
              projectId={project.id}
              name={project.name}
              runs={runs.length}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete this project"
                title="Delete this project"
                data-testid="project-delete"
              >
                <Trash2 />
              </Button>
            </DeleteProjectDialog>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight font-semibold tracking-[-0.03em]">
              {project.name}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {project.demo ? (
                <>
                  <span>Sample project</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span>
                {count} {count === 1 ? "workspace" : "workspaces"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {link ? "Sends work orders to 8090" : "Not linked to 8090"}
              </span>
              <span aria-hidden="true">·</span>
              {cockpit ? (
                <span>
                  {cockpit.fromRequirement
                    ? "Last requirement run"
                    : "Last run"}{" "}
                  <LocalTime iso={cockpit.ranAt} />
                </span>
              ) : (
                <span>Not run yet</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* The numbers that matter, as one quiet group. */}
            <div
              className="flex shrink-0 items-stretch overflow-hidden rounded-control border text-[0.8125rem]"
              data-testid="project-figures"
            >
              {running ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-link">
                  <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                  Running
                </span>
              ) : null}
              <span className={cn("px-2.5 py-1", running && "border-l")}>
                <span className="font-mono tabular-nums">
                  {cockpit?.totals.issues ?? 0}
                </span>{" "}
                <span className="text-muted-foreground">open</span>
              </span>
              {cockpit && cockpit.totals.bySeverity.critical > 0 ? (
                <span className="flex items-center gap-1.5 border-l px-2.5 py-1">
                  <span className="size-1.5 rounded-full bg-sev-critical" />
                  <span className="font-mono tabular-nums">
                    {cockpit.totals.bySeverity.critical}
                  </span>
                  <span className="text-muted-foreground">critical</span>
                </span>
              ) : null}
              <span className="border-l px-2.5 py-1">
                <span className="font-mono tabular-nums">{fixed.length}</span>{" "}
                <span className="text-muted-foreground">fixed</span>
              </span>
              <span
                className="border-l px-2.5 py-1 font-mono tabular-nums"
                title="Spent on this project's runs this month"
              >
                {formatCost(spentUsd)}
                {schedule.monthlyCapUsd !== null
                  ? ` / ${formatCost(schedule.monthlyCapUsd)}`
                  : ""}
              </span>
            </div>
            {kindButton("crosswind", "Crosswind", Wind, true)}
            {kindButton("flyoff", "Fly-Off", Swords, false)}
            {kindButton("blackbox", "Black Box", Siren, true)}
            {/* The one solid button on the page. */}
            {runProject(count > 0)}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Project sections"
            className="flex flex-wrap gap-1"
            data-testid="project-tabs"
          >
            {tabs.map((item) => (
              <Link
                key={item.id}
                href={
                  item.id === "overview"
                    ? `/app/projects/${project.id}`
                    : `/app/projects/${project.id}?tab=${item.id}`
                }
                scroll={false}
                aria-current={tab === item.id ? "page" : undefined}
                data-testid={`project-tab-${item.id}`}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-control border border-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground [&_svg]:size-4",
                  tab === item.id &&
                    "border-border bg-secondary text-foreground",
                )}
              >
                <item.icon aria-hidden="true" />
                {item.label}
                {item.count !== undefined ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.count}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </Panel>

      {running && tab === "overview" ? (
        <ProjectLive
          runId={running.id}
          expected={project.workspaces
            .filter(
              (item) =>
                running.workspaces.length === 0 ||
                running.workspaces.includes(item.name),
            )
            .map(({ name, label }) => ({ name, label }))}
        />
      ) : null}

      <PullRequestRefresher projectId={project.id} />
      {mergedCount > 0 && !running && tab === "overview" ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-card border bg-card px-4 py-2.5 text-[0.8125rem]"
          data-testid="project-rescan"
        >
          <GitMerge className="size-4 text-sev-high" aria-hidden="true" />
          <p className="flex-1">
            <span className="font-medium">
              {mergedCount} {mergedCount === 1 ? "fix" : "fixes"} merged.
            </span>{" "}
            <span className="text-muted-foreground">
              Rescan the project to confirm{" "}
              {mergedCount === 1 ? "it is" : "they are"} gone.
            </span>
          </p>
          <RunProjectDialog
            projectId={project.id}
            workspaces={count}
            blocked={project.demo ? null : blocked}
            sampleMode={status.sampleMode}
            sampleProject={project.demo}
          >
            <Button
              size="sm"
              variant="outline"
              data-testid="project-rescan-run"
            >
              <RotateCcw />
              Rescan
            </Button>
          </RunProjectDialog>
        </div>
      ) : null}

      {cockpit && tab !== "runs" && tab !== "setup" ? (
        <Cockpit
          cockpit={cockpit}
          earlier={earlier}
          delivered={delivered}
          tracked={tracked}
          fixed={fixed}
          section={tab}
        />
      ) : cockpit || tab !== "overview" ? null : count === 0 ? (
        <div
          className="flex flex-col items-center rounded-card border border-dashed px-6 py-16 text-center"
          data-testid="project-empty-workspaces"
        >
          <h2 className="text-[0.9375rem] font-medium">
            Add the first workspace
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            A workspace is one repository of this application: its frontend, a
            backend service, a shared library. Add one or several; the agents
            read them together.
          </p>
          <div className="mt-6">{addWorkspace("Add workspace", true)}</div>
        </div>
      ) : (
        <div
          className="flex flex-col items-center rounded-card border border-dashed px-6 py-16 text-center"
          data-testid="project-empty-run"
        >
          <h2 className="text-[0.9375rem] font-medium">
            {running
              ? "The first run is in progress"
              : "Ready for its first run"}
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            {count === 1
              ? "Five agents read the workspace"
              : `Five agents read all ${count} workspaces together`}
            . The cockpit then shows the architecture and every issue they find.
          </p>
        </div>
      )}

      {cockpit && tab === "runs" ? (
        <IssueTrend points={trend} fixed={fixed.length} />
      ) : null}

      {runs.length > 0 && tab === "runs" ? (
        <ProjectRuns
          runs={shownRuns}
          workspaces={project.workspaces.map((item) => item.name)}
          picked={picked}
          page={query.page}
          projectId={project.id}
        />
      ) : null}
      {/* Setup: what the project reads, what it is, and where work goes. */}
      {tab === "setup" ? (
        <section
          id="setup"
          className="scroll-mt-6 space-y-4"
          data-testid="project-setup"
        >
          {project.description ? (
            <p className="max-w-3xl text-sm text-muted-foreground">
              {project.description}
            </p>
          ) : null}
          {/* The workspaces: the repositories that make up the application. */}
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="project-workspaces"
          >
            {project.workspaces.map((workspace) => {
              const Icon =
                workspace.origin.kind === "github" ? GitBranch : FolderGit2;
              return (
                <span
                  key={workspace.id}
                  className="flex h-8 items-center gap-2 rounded-card border bg-card pr-0.5 pl-2.5 text-sm"
                  data-testid="project-workspace"
                >
                  <Icon
                    className="size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="font-medium">{workspace.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {workspace.label}
                  </span>
                  <RemoveWorkspaceButton
                    projectId={project.id}
                    workspaceId={workspace.id}
                    name={workspace.name}
                  />
                </span>
              );
            })}
            {count > 0 ? addWorkspace("Add workspace") : null}
          </div>

          {/* Where this project's work orders go. */}
          <ProjectLink
            projectId={project.id}
            externalId={link}
            connected={connected}
          />
        </section>
      ) : null}
    </div>
  );
}

type ProjectTab = "overview" | "issues" | "security" | "runs" | "setup";

export default function Page({
  params,
  searchParams,
}: PageProps<"/app/projects/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Reading the project" />}>
      <ProjectPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The project's runs, newest first, a page at a time (the page is in the
 * address, with the tab and the workspace filter). Each row starts with
 * its kind, as on the Runs page.
 */
function ProjectRuns({
  runs,
  workspaces,
  picked,
  page: asked,
  projectId,
}: {
  runs: RunSummary[];
  workspaces: string[];
  picked: string[];
  page: unknown;
  projectId: string;
}) {
  const page = pageOf(runs, asked);
  const ids = page.items
    .filter((run) => run.status !== "running")
    .map((run) => run.id);
  const hrefFor = (n: number) => {
    const params = new URLSearchParams({ tab: "runs" });
    for (const name of picked) params.append("workspace", name);
    if (n > 1) params.set("page", String(n));
    return `/app/projects/${projectId}?${params}#runs`;
  };
  return (
    <section id="runs" className="scroll-mt-16">
      <RunFilters workspaces={workspaces} />
      <RunSelection ids={ids}>
        <Panel className="overflow-hidden">
          <Table data-testid="project-runs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <RunCheckAll ids={ids} />
                </TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Issues</TableHead>
                <TableHead className="text-right">Work orders</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                    data-testid="project-runs-none-match"
                  >
                    No run read{" "}
                    {picked.length === 1
                      ? "that workspace"
                      : "all of those workspaces"}
                    .
                  </TableCell>
                </TableRow>
              ) : null}
              {page.items.map((run) => {
                const { kind } = runRow(run);
                const Icon = FEATURE_ICON[kind.id];
                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <RunCheck
                        id={run.id}
                        title={run.title}
                        disabled={run.status === "running"}
                      />
                    </TableCell>
                    <TableCell data-testid="project-run-kind">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Icon
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {kind.label}
                        {kind.detail ? (
                          <span className="text-xs text-muted-foreground">
                            {kind.detail}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <LocalTime iso={run.createdAt} />
                    </TableCell>
                    <TableCell>
                      <WorkspaceChips names={run.workspaces} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {run.findingCount}
                      {run.workspaces.length === 0 ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {run.findingCount === 1 ? "risk" : "risks"}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {run.workOrderCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/app/runs/${run.id}`}
                        data-testid="project-run-link"
                        className={buttonVariants({
                          variant: "link",
                          size: "sm",
                        })}
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pager
            page={page}
            noun={["run", "runs"]}
            href={hrefFor}
            testId="project-runs-pager"
          />
        </Panel>
      </RunSelection>
    </section>
  );
}
