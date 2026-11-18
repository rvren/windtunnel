import Link from "next/link";
import {
  ArrowRight,
  GitCompareArrows,
  LoaderCircle,
  Siren,
  Trophy,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { LocalTime } from "@/components/local-time";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/run/badges";
import { buttonVariants } from "@/components/ui/button";
import { FEATURES, featureOf, plainTitle, type Feature } from "@/lib/features";
import { cn } from "@/lib/utils";
import type { RunKind, RunSummary } from "@/server/engine/schema";

/*
 * The first screen of the app: what Windtunnel can do, as four cards, and
 * the three steps every run takes. Each card starts its kind of run. Under
 * them, the runs going now and the latest ones, to carry on.
 */

export const FEATURE_ICON: Record<RunKind, LucideIcon> = {
  audit: Wind,
  crosswind: GitCompareArrows,
  flyoff: Trophy,
  blackbox: Siren,
};

const STEPS = [
  "Choose what to test",
  "Watch the agents work",
  "Get the result",
];

function FeatureCard({ feature, main }: { feature: Feature; main: boolean }) {
  const Icon = FEATURE_ICON[feature.kind];
  return (
    <Link
      href={`/app/runs/new?kind=${feature.kind}`}
      data-testid={`launcher-${feature.kind}`}
      className="group flex flex-col rounded-card border bg-card p-6 transition-colors duration-200 outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-tile border",
            main && "border-brand/40 text-brand",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-medium">{feature.name}</h2>
      </div>
      <p className="mt-5 text-lg leading-snug">{feature.question}</p>
      <p className="mt-2 text-sm text-muted-foreground">{feature.promise}</p>
      <dl className="mt-5 mb-6 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem]">
        <dt className="text-muted-foreground">You give</dt>
        <dd>{feature.input}</dd>
        <dt className="text-muted-foreground">You get</dt>
        <dd>{feature.output}</dd>
      </dl>
      <span
        className={cn(
          buttonVariants({ variant: main ? "default" : "outline" }),
          "mt-auto self-start",
        )}
      >
        {feature.start}
        <ArrowRight
          className="transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
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
    <div className="mx-auto max-w-5xl space-y-10" data-testid="launcher">
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

      <div className="grid gap-4 md:grid-cols-2">
        {FEATURES.map((feature, index) => (
          <FeatureCard
            key={feature.kind}
            feature={feature}
            main={index === 0}
          />
        ))}
      </div>

      <Recent runs={runs} />
    </div>
  );
}
