import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { SampleBadge } from "@/components/run/badges";
import { RunForm } from "@/components/run/run-form";
import { engineStatus } from "@/server/status";

export const metadata: Metadata = { title: "New run" };

async function Form() {
  await connection();
  const status = await engineStatus();
  const blocked = !status.database.up
    ? "The database is not reachable. Start it with `docker compose up -d db`, then reload this page."
    : !status.apiKey && !status.sampleMode
      ? "No API key is set. Add ANTHROPIC_API_KEY to .env.local and restart the server."
      : null;
  return (
    <>
      {status.sampleMode ? (
        <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <SampleBadge />
          Sample mode is on. Runs replay sample data and do not call the model.
        </p>
      ) : null}
      <RunForm blocked={blocked} />
    </>
  );
}

export default function NewRunPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New run"
        description="Describe what you want to build. Five agents will test the design and report what fails."
      />
      <Suspense fallback={<PageLoading label="Checking the engine" />}>
        <Form />
      </Suspense>
    </div>
  );
}
