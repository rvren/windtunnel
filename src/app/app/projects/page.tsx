import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { GitPullRequest, Lightbulb, Plus } from "lucide-react";

import {
  MetaChip,
  PageHeader,
  PageLoading,
} from "@/components/app/page-header";
import { Mark } from "@/components/brand/logo";
import { NewProjectDialog } from "@/components/project/project-dialogs";
import {
  ProjectsBoard,
  type BoardMeta,
} from "@/components/project/projects-board";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { homeNumbers } from "@/lib/viz/home";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import type { RunSummary } from "@/server/engine/schema";
import { ensureTracked, listIssues, type Issue } from "@/server/issues/store";
import { listProjects, type Project } from "@/server/projects/store";

export const metadata: Metadata = { title: "Projects" };

async function ProjectsList() {
  await connection();
  let projects: Project[];
  let runs: RunSummary[];
  let issues: Issue[];
  try {
    await ensureDatabase();
    projects = await listProjects();
    for (const project of projects) await ensureTracked(project.id);
    [issues, runs] = await Promise.all([listIssues(), runStore().list()]);
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
        className="flex flex-col items-center rounded-card border border-dashed px-6 py-16 text-center"
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
            New Project
          </Button>
        </NewProjectDialog>
      </div>
    );
  }

  const numbers = homeNumbers({
    projects: projects.map(({ id, name }) => ({ id, name })),
    issues,
    runs,
  });
  const meta: Record<string, BoardMeta> = {};
  for (const project of projects) {
    meta[project.id] = {
      demo: project.demo,
      runs: runs.filter((run) => run.projectId === project.id).length,
    };
  }
  const all = numbers.projects;
  const open = all.reduce((sum, item) => sum + item.open, 0);
  const prs = all.reduce((sum, item) => sum + item.prs, 0);
  const fixed = all.reduce((sum, item) => sum + item.fixed, 0);
  const risks = all.reduce((sum, item) => sum + item.risks, 0);
  return (
    <>
      <div
        className="-mt-3 mb-6 flex flex-wrap items-center gap-1.5"
        data-testid="page-meta"
      >
        <MetaChip dot="var(--sev-high)">{open} open issues</MetaChip>
        <MetaChip icon={GitPullRequest}>{prs} pull requests open</MetaChip>
        <MetaChip dot="var(--ok)">{fixed} fixed</MetaChip>
        {risks > 0 ? (
          <MetaChip icon={Lightbulb}>{risks} probable risks</MetaChip>
        ) : null}
      </div>
      <ProjectsBoard numbers={numbers} meta={meta} />
    </>
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
            New Project
          </Button>
        </NewProjectDialog>
      </PageHeader>
      <Suspense fallback={<PageLoading label="Reading the projects" />}>
        <ProjectsList />
      </Suspense>
    </>
  );
}
