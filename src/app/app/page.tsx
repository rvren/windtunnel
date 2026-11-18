import { Suspense } from "react";
import type { Metadata } from "next";

import { PageLoading } from "@/components/app/page-header";
import { Launcher } from "@/components/home/launcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import type { RunSummary } from "@/server/engine/schema";

export const metadata: Metadata = { title: "Home" };

/** How many runs the home page lists to carry on with. */
const RECENT = 5;

/** The runs going now, then the newest, or null when the database is down. */
async function recentRuns(): Promise<RunSummary[] | null> {
  try {
    await ensureDatabase();
    const runs = await runStore().list();
    const running = runs.filter((run) => run.status === "running");
    const rest = runs.filter((run) => run.status !== "running");
    return [...running, ...rest].slice(0, Math.max(RECENT, running.length));
  } catch {
    return null;
  }
}

/** What Windtunnel can do, and the runs to carry on with. */
async function HomePage() {
  const runs = await recentRuns();
  if (!runs) {
    return (
      <Alert variant="destructive">
        <AlertTitle>The database is not reachable</AlertTitle>
        <AlertDescription>
          Start it with `docker compose up -d db`, then reload this page.
        </AlertDescription>
      </Alert>
    );
  }
  return <Launcher runs={runs} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading label="Reading your runs" />}>
      <HomePage />
    </Suspense>
  );
}
