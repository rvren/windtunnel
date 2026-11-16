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
import { engineConfig } from "@/server/engine/config";
import { runStore } from "@/server/engine/registry";
import type { RunRecord } from "@/server/engine/schema";
import { getProject } from "@/server/projects/store";
import { threadOf, versionChanges } from "@/lib/viz/refine";

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
  const sampleMode = engineConfig().sampleMode;
  let context: RunContext = {
    previous: null,
    previousSeverity: null,
    sent: null,
    tracked: {},
    cost: sampleMode ? "sample-mode" : "billed",
    versions: [],
    parent: null,
  };
  try {
    if (run.projectId) {
      const store = runStore();
      const all = await store.list({ projectId: run.projectId });
      const project = await getProject(run.projectId);
      // A requirement's versions, and what changed since the one before.
      const versions = run.source
        ? []
        : threadOf(all, run.id).map((version) => ({
            id: version.run.id,
            number: version.number,
            status: version.run.status,
          }));
      const parentRecord =
        !run.source && run.parentRunId
          ? await store.get(run.parentRunId)
          : null;
      const parent = parentRecord
        ? {
            id: parentRecord.id,
            number:
              versions.find((item) => item.id === parentRecord.id)?.number ?? 1,
            requirement: parentRecord.requirement,
            changes:
              parentRecord.status === "completed" && run.status === "completed"
                ? versionChanges(parentRecord, run)
                : null,
          }
        : null;
      const earlier = all
        .filter(
          (item) =>
            item.id !== run.id &&
            item.status === "completed" &&
            item.createdAt < run.createdAt &&
            // Compare like with like: code with code, idea with idea, and a
            // kind of run only with its own kind.
            item.kind === (run.kind ?? "audit") &&
            item.workspaces.length > 0 === Boolean(run.source),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const previous = earlier[0] ?? null;
      const record = previous ? await store.get(previous.id) : null;
      const link = await getProjectLink(run.projectId, SOFTWARE_FACTORY);
      context = {
        cost: project?.demo
          ? "sample-project"
          : sampleMode
            ? "sample-mode"
            : "billed",
        versions,
        parent,
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
              {
                id: item.id,
                state: item.state,
                pr: item.pr,
                origin: item.origin,
              },
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
