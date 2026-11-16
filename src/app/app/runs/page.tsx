import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { KIND_LABEL } from "@/lib/labels";
import { Mark } from "@/components/brand/logo";
import { LocalTime } from "@/components/local-time";
import { StatusBadge } from "@/components/run/badges";
import { Badge } from "@/components/ui/badge";
import {
  RunCheck,
  RunCheckAll,
  RunSelection,
} from "@/components/run/run-delete";
import { RunFilters, WorkspaceChips } from "@/components/run/run-filters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import type { RunSummary } from "@/server/engine/schema";
import { listProjects, type Project } from "@/server/projects/store";

async function RunsTable({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const projectId = typeof query.project === "string" ? query.project : null;
  const picked = [query.workspace ?? []].flat();
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

  const nameOf = new Map(projects.map((item) => [item.id, item.name]));
  const deletable = runs
    .filter((run) => run.status !== "running")
    .map((run) => run.id);
  const current = projects.find((item) => item.id === projectId);
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
      <RunSelection ids={deletable}>
        <div className="overflow-hidden rounded-card border bg-card">
          <Table data-testid="runs-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <RunCheckAll ids={deletable} />
                </TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Findings</TableHead>
                <TableHead className="text-right">Work orders</TableHead>
                <TableHead className="text-right">Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-muted-foreground"
                    data-testid="runs-none-match"
                  >
                    No run matches these filters.
                  </TableCell>
                </TableRow>
              ) : null}
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <RunCheck
                      id={run.id}
                      title={run.title}
                      disabled={run.status === "running"}
                    />
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    <Link
                      href={`/app/runs/${run.id}`}
                      data-testid="runs-row-link"
                      className="line-clamp-2 font-medium underline-offset-4 hover:underline"
                    >
                      {/* A run of a project's code is titled after the project,
                        which the next column already shows. */}
                      {run.projectId && run.title === nameOf.get(run.projectId)
                        ? "Code run"
                        : run.title}
                    </Link>
                    {run.kind !== "audit" ? (
                      <Badge
                        variant="secondary"
                        className="mt-1"
                        data-testid="runs-row-kind"
                      >
                        {KIND_LABEL[run.kind]}
                      </Badge>
                    ) : run.workspaces.length === 0 ? (
                      <Badge
                        variant="secondary"
                        className="mt-1"
                        title="Tests an idea: its findings are probable risks."
                      >
                        Requirement
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {run.projectId && nameOf.has(run.projectId) ? (
                      <Link
                        href={`/app/projects/${run.projectId}`}
                        data-testid="runs-row-project"
                        className="underline-offset-4 hover:underline"
                      >
                        {nameOf.get(run.projectId)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">No project</span>
                    )}
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
                  <TableCell className="text-right text-muted-foreground">
                    <LocalTime iso={run.createdAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </RunSelection>
    </>
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
