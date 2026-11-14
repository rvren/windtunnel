import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderGit2, GitBranch, Play, Plus, Trash2 } from "lucide-react";

import { PageLoading } from "@/components/app/page-header";
import { LocalTime } from "@/components/local-time";
import { Panel } from "@/components/panel";
import { Cockpit } from "@/components/project/cockpit";
import {
  AddWorkspaceDialog,
  DeleteProjectDialog,
  RemoveWorkspaceButton,
  RunProjectDialog,
} from "@/components/project/project-dialogs";
import { ProjectLink } from "@/components/connectors/project-link";
import { ProjectLive } from "@/components/project/project-live";
import { SampleBadge, StatusBadge } from "@/components/run/badges";
import { RunFilters, WorkspaceChips } from "@/components/run/run-filters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { getConnection, getProjectLink } from "@/server/connectors/store";
import { ensureDatabase } from "@/server/db/ready";
import { localRepos } from "@/server/engine/repo/fetch";
import { runStore } from "@/server/engine/registry";
import { sampleServiceOf } from "@/server/engine/sample-project";
import type { RunSummary } from "@/server/engine/schema";
import {
  buildCockpit,
  type Cockpit as CockpitData,
} from "@/server/projects/cockpit";
import { DEMO_REPOSITORIES } from "@/server/projects/demo";
import { getProject, type Project } from "@/server/projects/store";
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
  const picked = [(await searchParams).workspace ?? []].flat();
  if (!UUID.test(id)) notFound();

  let project: Project | null;
  let runs: RunSummary[];
  let shownRuns: RunSummary[];
  let cockpit: CockpitData | null = null;
  try {
    await ensureDatabase();
    project = await getProject(id);
    runs = project ? await runStore().list({ projectId: id }) : [];
    shownRuns =
      project && picked.length > 0
        ? await runStore().list({ projectId: id, workspaces: picked })
        : runs;
    // The cockpit shows the latest run that finished.
    const finished = runs.find((run) => run.status === "completed");
    const record = finished ? await runStore().get(finished.id) : null;
    if (record) cockpit = buildCockpit(record);
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
  const status = await engineStatus();
  const blocked =
    !status.apiKey && !status.sampleMode
      ? "No API key is set. Add ANTHROPIC_API_KEY to .env.local and restart the server."
      : null;
  const folders = await localRepos();
  const githubToken = Boolean(process.env.GITHUB_TOKEN?.trim());
  const running = runs.find((run) => run.status === "running");
  const count = project.workspaces.length;

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
        disabled={count === 0 || Boolean(running)}
        data-testid="project-run"
      >
        <Play />
        Run project
      </Button>
    </RunProjectDialog>
  );

  return (
    <div className="space-y-10" data-testid="project-page">
      <header className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-4xl font-semibold tracking-[-0.03em]">
              {project.name}
              {project.demo ? <Badge variant="secondary">Sample</Badge> : null}
            </h1>
            {project.description ? (
              <p className="mt-2 max-w-3xl text-[15px] text-muted-foreground">
                {project.description}
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              {cockpit ? (
                <>
                  Last run <LocalTime iso={cockpit.ranAt} />
                  {cockpit.sample ? <SampleBadge /> : null}
                </>
              ) : (
                "Not run yet"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DeleteProjectDialog projectId={project.id} name={project.name}>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete this project"
                data-testid="project-delete"
              >
                <Trash2 />
              </Button>
            </DeleteProjectDialog>
            {/* The one solid button on the page. */}
            {runProject(count > 0)}
          </div>
        </div>

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
      </header>

      {running ? (
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

      {cockpit ? (
        <Cockpit cockpit={cockpit} />
      ) : count === 0 ? (
        <div
          className="flex flex-col items-center rounded-card border border-dashed px-6 py-16 text-center"
          data-testid="project-empty-workspaces"
        >
          <h2 className="text-lg font-medium">Add the first workspace</h2>
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
          <h2 className="text-lg font-medium">
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

      {runs.length > 0 ? (
        <section>
          <h2 className="mb-4 text-lg font-medium">Runs</h2>
          <RunFilters
            workspaces={project.workspaces.map((item) => item.name)}
          />
          <Panel className="overflow-hidden">
            <Table data-testid="project-runs">
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Workspaces</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Issues</TableHead>
                  <TableHead className="text-right">Work orders</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownRuns.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
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
                {shownRuns.map((run) => (
                  <TableRow key={run.id}>
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
                ))}
              </TableBody>
            </Table>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

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
