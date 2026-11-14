import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { SampleBadge } from "@/components/run/badges";
import { RunForm } from "@/components/run/run-form";
import { buttonVariants } from "@/components/ui/button";
import { listProjects } from "@/server/projects/store";
import { engineStatus } from "@/server/status";

export const metadata: Metadata = { title: "New run" };

async function Form({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { project } = await searchParams;
  const status = await engineStatus();
  if (!status.database.up) {
    return (
      <p className="text-sm text-muted-foreground">
        The database is not reachable. Start it with `docker compose up -d db`,
        then reload this page.
      </p>
    );
  }
  const projects = await listProjects();
  if (projects.length === 0) {
    return (
      <div
        className="rounded-card border border-dashed px-6 py-12 text-center"
        data-testid="run-form-no-project"
      >
        <h2 className="text-lg font-medium">Create a project first</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Every run belongs to a project.
        </p>
        <Link
          href="/app/projects"
          className={buttonVariants({ className: "mt-6" })}
        >
          Go to projects
        </Link>
      </div>
    );
  }
  return (
    <>
      {status.sampleMode ? (
        <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <SampleBadge />
          Sample mode is on. Runs replay sample data and do not call the model.
        </p>
      ) : null}
      <RunForm
        sampleMode={status.sampleMode}
        blocked={
          !status.apiKey && !status.sampleMode
            ? "No API key is set. Add ANTHROPIC_API_KEY to .env.local and restart the server."
            : null
        }
        projects={projects.map((item) => ({
          id: item.id,
          name: item.name,
          demo: item.demo,
          workspaces: item.workspaces.map(({ name, label }) => ({
            name,
            label,
          })),
        }))}
        initialProjectId={typeof project === "string" ? project : null}
      />
    </>
  );
}

export default function NewRunPage({
  searchParams,
}: PageProps<"/app/runs/new">) {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New run"
        description="Choose a project, then describe what you want to build or point the agents at its code. Five agents test it and report what fails."
      />
      <Suspense fallback={<PageLoading label="Checking the engine" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
