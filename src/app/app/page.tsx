import { Suspense } from "react";
import type { Metadata } from "next";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { Home } from "@/components/home/home";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { homeNumbers } from "@/lib/viz/home";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import { ensureTracked, listIssues } from "@/server/issues/store";
import { listProjects } from "@/server/projects/store";

export const metadata: Metadata = { title: "Home" };

/** Everything the home page shows, or null when the database is down. */
async function loadHome() {
  try {
    await ensureDatabase();
    const projects = await listProjects();
    for (const project of projects) await ensureTracked(project.id);
    const [issues, runs] = await Promise.all([listIssues(), runStore().list()]);
    return {
      count: projects.length,
      numbers: homeNumbers({
        projects: projects.map(({ id, name }) => ({ id, name })),
        issues,
        runs,
      }),
    };
  } catch {
    return null;
  }
}

/** The fix pipeline across every project. */
async function HomePage() {
  const home = await loadHome();
  if (!home) {
    return (
      <Alert variant="destructive">
        <AlertTitle>The database is not reachable</AlertTitle>
        <AlertDescription>
          Start it with `docker compose up -d db`, then reload this page.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <PageHeader
        title="Home"
        description={`Across ${home.count} ${home.count === 1 ? "project" : "projects"}: what is open, what is being fixed, and what is confirmed gone.`}
      />
      <Home numbers={home.numbers} />
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading label="Reading your projects" />}>
      <HomePage />
    </Suspense>
  );
}
