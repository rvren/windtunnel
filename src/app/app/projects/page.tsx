import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Plus } from "lucide-react";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { Mark } from "@/components/brand/logo";
import { LocalTime } from "@/components/local-time";
import { NewProjectDialog } from "@/components/project/project-dialogs";
import { StatusBadge } from "@/components/run/badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export const metadata: Metadata = { title: "Projects" };

async function ProjectsTable() {
  await connection();
  let projects: Project[];
  let latest: Map<string, RunSummary>;
  try {
    await ensureDatabase();
    projects = await listProjects();
    // Runs come newest first, so the first one seen for a project is its latest.
    latest = new Map();
    for (const run of await runStore().list()) {
      if (run.projectId && !latest.has(run.projectId)) {
        latest.set(run.projectId, run);
      }
    }
  } catch {
    return (
      <Alert variant="destructive" data-testid="projects-database-down">
        <AlertTitle>The database is not reachable</AlertTitle>
        <AlertDescription>
          Start it with `docker compose up -d db`, then reload this page.
        </AlertDescription>
      </Alert>
    );
  }

  if (projects.length === 0) {
    return (
      <div
        className="flex flex-col items-center rounded-md border border-dashed px-6 py-16 text-center"
        data-testid="projects-empty"
      >
        <Mark className="size-10" />
        <h2 className="mt-5 text-lg font-medium">Create your first project</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          A project is one application. Add its repositories as workspaces, and
          the agents read them together.
        </p>
        <NewProjectDialog>
          <Button className="mt-6" data-testid="projects-empty-new">
            <Plus />
            New project
          </Button>
        </NewProjectDialog>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <Table data-testid="projects-table">
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Workspaces</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead className="text-right">Work orders</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const run = latest.get(project.id);
            return (
              <TableRow key={project.id}>
                <TableCell className="max-w-md whitespace-normal">
                  <Link
                    href={`/app/projects/${project.id}`}
                    data-testid="projects-row-link"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {project.name}
                  </Link>
                  {project.demo ? (
                    <Badge variant="secondary" className="ml-2">
                      Sample
                    </Badge>
                  ) : null}
                  {project.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {project.workspaces.length > 0
                    ? project.workspaces.map((item) => item.name).join(", ")
                    : "None yet"}
                </TableCell>
                <TableCell>
                  {run ? (
                    <span className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <LocalTime
                        iso={run.createdAt}
                        className="text-xs text-muted-foreground"
                      />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not run yet</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {run?.status === "completed" ? run.findingCount : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {run?.status === "completed" ? run.workOrderCount : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="One project is one application. Its workspaces are the repositories that make it up."
      >
        <NewProjectDialog>
          <Button data-testid="projects-new">
            <Plus />
            New project
          </Button>
        </NewProjectDialog>
      </PageHeader>
      <Suspense fallback={<PageLoading label="Reading the projects" />}>
        <ProjectsTable />
      </Suspense>
    </>
  );
}
