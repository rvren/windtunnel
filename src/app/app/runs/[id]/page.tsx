import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageLoading } from "@/components/app/page-header";
import { RunView } from "@/components/run/run-view";
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
  return <RunView initial={run} />;
}

export default function RunPage({ params }: PageProps<"/app/runs/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Reading the run" />}>
      <Run params={params} />
    </Suspense>
  );
}
