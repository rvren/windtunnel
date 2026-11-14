import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageLoading } from "@/components/app/page-header";
import { RunView, type RunContext } from "@/components/run/run-view";
import { SOFTWARE_FACTORY } from "@/server/connectors/software-factory";
import { getProjectLink, listDeliveries } from "@/server/connectors/store";
import { listIssues } from "@/server/issues/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import type { RunRecord } from "@/server/engine/schema";

export const metadata: Metadata = { title: "Run" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Run({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let run: RunRecord | null;
  try {
    await ensureDatabase();
    run = await runStore().get(id);
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
  if (!run) notFound();

  // For the report's right column: the project's previous finished run,
  // and the work orders that reached 8090 when the project is linked.
  let context: RunContext = {
    previous: null,
    previousSeverity: null,
    sent: null,
    tracked: {},
  };
  try {
    if (run.projectId) {
      const store = runStore();
      const earlier = (await store.list({ projectId: run.projectId }))
        .filter(
          (item) =>
            item.id !== run.id &&
            item.status === "completed" &&
            item.createdAt < run.createdAt,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const previous = earlier[0] ?? null;
      const record = previous ? await store.get(previous.id) : null;
      const link = await getProjectLink(run.projectId, SOFTWARE_FACTORY);
      context = {
        previous,
        previousSeverity: record
          ? {
              critical: record.groups.filter((g) => g.severity === "critical")
                .length,
              high: record.groups.filter((g) => g.severity === "high").length,
            }
          : null,
        sent: link
          ? (await listDeliveries(run.id, SOFTWARE_FACTORY)).filter(
              (item) => item.status === "sent",
            ).length
          : null,
        tracked: Object.fromEntries(
          (await listIssues(run.projectId))
            .filter((item) => item.lastRunId === run.id && item.lastGroupId)
            .map((item) => [
              item.lastGroupId!,
              { id: item.id, state: item.state, pr: item.pr },
            ]),
        ),
      };
    }
  } catch {
    // The right column does without; the run itself still shows.
  }
  return <RunView initial={run} context={context} />;
}

export default function RunPage({ params }: PageProps<"/app/runs/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Reading the run" />}>
      <Run params={params} />
    </Suspense>
  );
}
