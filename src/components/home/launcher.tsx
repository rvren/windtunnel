import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { FEATURE_ICON } from "@/components/feature-icon";
import { LocalTime } from "@/components/local-time";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/run/badges";
import { buttonVariants } from "@/components/ui/button";
import { JOBS, featureOf, plainTitle, type Feature } from "@/lib/features";
import { cn } from "@/lib/utils";

import { FeatureArt } from "./illustrations";
import type { RunSummary } from "@/server/engine/schema";

/*
 * The first screen of the app: what Windtunnel can do, grouped by the job
 * you came to do, and the three steps every run takes. Each kind has a
 * card: a drawing of what it does, its question, what you give it, what
 * you get back and who does the work. A card starts its kind of run.
 * Under them, the runs going now and the latest ones, to carry on.
 */

const STEPS = [
  "Choose what to test",
  "Watch the agents work",
  "Get the result",
];

const CARD =
  "group rounded-card border bg-card p-3 transition-colors duration-200 outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring";

/** The columns a group of this many cards sits in on a wide screen. */
const COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};

function FeatureCard({ feature, main }: { feature: Feature; main: boolean }) {
  const Icon = FEATURE_ICON[feature.kind];
  // Four rows shared with the cards beside it (subgrid): the drawing, the
  // words, the facts, the button. However long a card's words, its facts
  // and its button sit level with its neighbours'.
  return (
    <Link
      href={`/app/runs/new?kind=${feature.kind}`}
      data-testid={`launcher-${feature.kind}`}
      className={cn(CARD, "row-span-4 grid grid-rows-subgrid gap-y-0")}
    >
      <FeatureArt
        kind={feature.kind}
        className="h-44 transition-shadow duration-200 group-hover:ring-brand/30"
      />
      <div className="px-3 pt-5">
        <div className="flex items-center gap-2.5">
          <Icon className="size-[1.125rem] text-brand" aria-hidden="true" />
          <h3 className="text-lg font-medium">{feature.name}</h3>
          {feature.fresh ? (
            <span
              className="rounded-full border border-brand/40 px-2 py-0.5 font-mono text-[0.625rem] tracking-wide text-brand uppercase"
              data-testid={`launcher-new-${feature.kind}`}
            >
              New
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[0.9375rem] leading-snug font-medium">
          {feature.question}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {feature.promise}
        </p>
        {feature.news ? (
          <p className="mt-3 flex items-center gap-2 text-[0.8125rem]">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-brand"
            />
            {feature.news}
          </p>
        ) : null}
      </div>
      <dl className="mx-3 mt-5 mb-6 grid grid-cols-[4.75rem_1fr] gap-x-3 gap-y-2 border-t pt-4 text-[0.8125rem]">
        <dt className="text-muted-foreground">You give</dt>
        <dd>{feature.input}</dd>
        <dt className="text-muted-foreground">You get</dt>
        <dd>{feature.output}</dd>
        <dt className="text-muted-foreground">Who works</dt>
        <dd>{feature.team}</dd>
      </dl>
      <div className="px-3 pb-3">
        <span
          className={cn(
            buttonVariants({ variant: main ? "default" : "outline" }),
            "self-start justify-self-start",
          )}
          data-testid={`launcher-start-${feature.kind}`}
        >
          {feature.start}
          <ArrowRight
            className="transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}

function Recent({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return null;
  return (
    <Panel data-testid="launcher-recent">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-[0.8125rem] font-medium">Carry on</h2>
        <Link
          href="/app/runs"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          All Runs
        </Link>
      </div>
      <ul className="divide-y">
        {runs.map((run) => {
          const Icon = FEATURE_ICON[run.kind];
          return (
            <li key={run.id}>
              <Link
                href={`/app/runs/${run.id}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-muted/40 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
              >
                {run.status === "running" ? (
                  <LoaderCircle
                    className="size-4 animate-spin text-brand"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">
                  <span className="text-muted-foreground">
                    {featureOf(run.kind).name} ·{" "}
                  </span>
                  {plainTitle(run.title)}
                </span>
                <StatusBadge status={run.status} />
                <LocalTime
                  iso={run.createdAt}
                  className="hidden font-mono text-[0.6875rem] text-muted-foreground sm:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function Launcher({ runs }: { runs: RunSummary[] }) {
  return (
    <div className="mx-auto max-w-6xl space-y-12" data-testid="launcher">
      <header className="space-y-4">
        <h1 className="text-4xl leading-tight font-semibold tracking-[-0.03em] text-balance">
          What do you want to test?
        </h1>
        <p className="max-w-2xl text-[0.9375rem] text-muted-foreground">
          Pick one. Agents do the work while you watch, and you get one clear
          result.
        </p>
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full border font-mono text-xs text-muted-foreground">
                  {index + 1}
                </span>
                {step}
              </span>
              {index < STEPS.length - 1 ? (
                <ArrowRight
                  className="size-3.5 text-muted-foreground/60"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </header>

      {JOBS.map((job) => (
        <section
          key={job.id}
          aria-labelledby={`launcher-job-${job.id}`}
          data-testid={`launcher-job-${job.id}`}
        >
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id={`launcher-job-${job.id}`} className="text-xl font-medium">
              {job.title}
            </h2>
            <p className="text-sm text-muted-foreground">{job.lead}</p>
          </div>
          <div
            className={cn(
              "grid gap-4 sm:grid-cols-2",
              COLUMNS[job.kinds.length] ?? "lg:grid-cols-3",
            )}
          >
            {job.kinds.map((kind) => (
              <FeatureCard
                key={kind}
                feature={featureOf(kind)}
                main={kind === "audit"}
              />
            ))}
          </div>
        </section>
      ))}

      <Recent runs={runs} />
    </div>
  );
}
