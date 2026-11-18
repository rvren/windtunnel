import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageLoading } from "@/components/app/page-header";
import { pillClass } from "@/components/pill";
import { FEATURE_ICON } from "@/components/home/launcher";
import { SampleBadge } from "@/components/run/badges";
import { StartForm } from "@/components/run/start/start-form";
import { buttonVariants } from "@/components/ui/button";
import { FEATURES, featureOf } from "@/lib/features";
import { RUN_KINDS, type RunKind } from "@/server/engine/schema";
import { listProjects } from "@/server/projects/store";
import { engineStatus } from "@/server/status";

export const metadata: Metadata = { title: "New run" };

const kindOf = (value: unknown): RunKind =>
  RUN_KINDS.includes(value as RunKind) ? (value as RunKind) : "audit";

/** The four kinds side by side, to switch without going back. */
function KindSwitch({
  kind,
  project,
}: {
  kind: RunKind;
  project: string | null;
}) {
  return (
    <nav
      aria-label="Kind of run"
      className="mb-8 flex flex-wrap gap-1"
      data-testid="start-kinds"
    >
      {FEATURES.map((feature) => {
        const Icon = FEATURE_ICON[feature.kind];
        const on = feature.kind === kind;
        const query = new URLSearchParams({ kind: feature.kind });
        if (project) query.set("project", project);
        return (
          <Link
            key={feature.kind}
            href={`/app/runs/new?${query}`}
            aria-current={on ? "page" : undefined}
            data-testid={`start-kind-${feature.kind}`}
            className={pillClass(on)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {feature.name}
          </Link>
        );
      })}
    </nav>
  );
}

async function Start({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const kind = kindOf(query.kind);
  const project = typeof query.project === "string" ? query.project : null;
  const feature = featureOf(kind);
  const Icon = FEATURE_ICON[kind];
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
  return (
    <>
      <KindSwitch kind={kind} project={project} />
      <header className="mb-9 flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-tile border border-brand/40 text-brand">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-4xl leading-tight font-semibold tracking-[-0.03em]">
            {feature.name}
          </h1>
          <p className="max-w-2xl text-[0.9375rem] text-muted-foreground">
            {feature.promise}
          </p>
          {status.sampleMode ? (
            <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <SampleBadge />
              Sample mode is on: runs replay sample data and cost nothing.
            </p>
          ) : null}
        </div>
      </header>
      {projects.length === 0 ? (
        <div
          className="max-w-3xl rounded-card border border-dashed px-6 py-12 text-center"
          data-testid="start-no-project"
        >
          <h2 className="text-lg font-medium">Create a project first</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Every run belongs to a project. Make one, or add the sample project
            to try Windtunnel for free.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/app/projects" className={buttonVariants()}>
              Go To Projects
            </Link>
            <Link
              href="/app/settings/sample-data"
              className={buttonVariants({ variant: "outline" })}
            >
              Add The Sample Project
            </Link>
          </div>
        </div>
      ) : (
        <StartForm
          key={kind}
          kind={kind}
          sampleMode={status.sampleMode}
          blocked={
            !status.apiKey && !status.sampleMode
              ? "No API key is set. Add ANTHROPIC_API_KEY to .env.local and restart the server."
              : null
          }
          projects={projects.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            demo: item.demo,
            workspaces: item.workspaces.map(({ name, label, origin }) => ({
              name,
              label,
              github: origin.kind === "github",
            })),
          }))}
          initialProjectId={project}
        />
      )}
    </>
  );
}

export default function NewRunPage({
  searchParams,
}: PageProps<"/app/runs/new">) {
  return (
    <Suspense fallback={<PageLoading label="Checking the engine" />}>
      <Start searchParams={searchParams} />
    </Suspense>
  );
}
