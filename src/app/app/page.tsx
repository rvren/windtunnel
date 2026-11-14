import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { Mark } from "@/components/brand/logo";
import { LocalTime } from "@/components/local-time";
import { StatusBadge } from "@/components/run/badges";
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
        className="flex flex-col items-center rounded-md border border-dashed px-6 py-16 text-center"
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
          New run
        </Link>
      </div>
    );
  }

  const nameOf = new Map(projects.map((item) => [item.id, item.name]));
  const current = projects.find((item) => item.id === projectId);
  return (
    <>
      <RunFilters
        projects={projects.map(({ id, name }) => ({ id, name }))}
        workspaces={current?.workspaces.map((item) => item.name) ?? []}
      />
      <div className="overflow-hidden rounded-md border bg-card">
        <Table data-testid="runs-table">
          <TableHeader>
            <TableRow>
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
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                  data-testid="runs-none-match"
                >
                  No run matches these filters.
                </TableCell>
              </TableRow>
            ) : null}
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="max-w-md whitespace-normal">
                  <Link
                    href={`/app/runs/${run.id}`}
                    data-testid="runs-row-link"
                    className="line-clamp-2 font-medium underline-offset-4 hover:underline"
                  >
                    {run.title}
                  </Link>
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
                <TableCell className="text-right">{run.findingCount}</TableCell>
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
    </>
  );
}

export default function RunsPage({ searchParams }: PageProps<"/app">) {
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
          New run
        </Link>
      </PageHeader>
      <Suspense fallback={<PageLoading label="Reading the runs" />}>
        <RunsTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}
