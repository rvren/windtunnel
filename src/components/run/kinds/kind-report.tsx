"use client";

import { useState } from "react";
import { LayoutGroup } from "motion/react";
import {
  ArrowUpRight,
  RotateCcw,
  Check,
  Copy,
  GitPullRequest,
  Trophy,
} from "lucide-react";

import { PullRequestDialog } from "@/components/issues/pr-dialog";
import type { TrackedState } from "@/components/issues/state-chip";
import { Panel } from "@/components/panel";
import { ArchitectureDiagram } from "@/components/project/architecture-diagram";
import { Remediation } from "@/components/run/remediation";

import { DuelRounds } from "./dogfight-report";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FINDING_TYPE_LABEL, SEVERITY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import { hopsAlong } from "@/lib/viz/flight-path";
import { rippleFlight } from "@/lib/viz/ripple";
import type {
  Architecture,
  ImpactEffect,
  RunRecord,
} from "@/server/engine/schema";
import type { CockpitComponent } from "@/server/projects/cockpit";

/*
 * The reports of the newer kinds of run, in the same quiet panels as the
 * rest of the run page: Crosswind's impact, a fly-off's verdict and
 * blueprints, and a black box's triage and fix.
 */

const EFFECT_TONE: Record<ImpactEffect, string> = {
  added: "var(--ok)",
  removed: "var(--sev-critical)",
  changed: "var(--sev-medium)",
  affected: "var(--sev-high)",
};

const EFFECT_LABEL: Record<ImpactEffect, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  affected: "Affected",
};

function Section({
  title,
  children,
  className,
  testId,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Panel className={cn("overflow-hidden", className)} data-testid={testId}>
      <h3 className="border-b px-4 py-2.5 text-[0.8125rem] font-medium">
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </Panel>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 size-1.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

const asParts = (architecture: Architecture): CockpitComponent[] =>
  architecture.components.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    workspace: item.workspace,
    description: item.description,
    issues: 0,
    worst: null,
  }));

// ── Crosswind ───────────────────────────────────────────────────────────────

function CopyReview({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      data-testid="crosswind-copy-review"
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy Review"}
    </Button>
  );
}

export function CrosswindReport({ run }: { run: RunRecord }) {
  const impact = run.impact;
  const change = run.change;
  const [view, setView] = useState<"after" | "before">("after");
  const [play, setPlay] = useState(0);
  if (!impact || !change) {
    return (
      <p className="text-[0.8125rem] text-muted-foreground">
        The impact is written when the run finishes.
      </p>
    );
  }
  const marks = Object.fromEntries(
    impact.components
      .filter((part) => part.effect !== "removed")
      .map((part) => [part.id, EFFECT_TONE[part.effect]]),
  );
  const removedMarks = Object.fromEntries(
    impact.components
      .filter((part) => part.effect === "removed")
      .map((part) => [part.id, EFFECT_TONE.removed]),
  );
  const shown = view === "after" ? impact.after : impact.before;
  const ripple =
    view === "after"
      ? rippleFlight(
          impact,
          change.input.kind === "text" ? change.input.text : change.title,
        )
      : null;
  const added = change.files.reduce((sum, file) => sum + file.additions, 0);
  const removed = change.files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <div className="space-y-4" data-testid="crosswind-report">
      <Section title="What the change does">
        <p className="max-w-3xl text-[0.8125rem] leading-relaxed">
          {impact.summary}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {change.url ? (
            <a
              href={change.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-link hover:underline"
            >
              {change.title || "The change on GitHub"}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          ) : (
            <span>Described in words</span>
          )}
          {change.base && change.head ? (
            <span className="font-mono">
              {change.head} → {change.base}
            </span>
          ) : null}
          {change.files.length > 0 ? (
            <span className="font-mono tabular-nums">
              {change.files.length} files · +{added} −{removed}
            </span>
          ) : null}
          {change.truncated ? <span>Some of the diff was left out</span> : null}
        </p>
      </Section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Section
          title={
            <span className="flex items-center justify-between gap-3">
              Architecture
              <span className="flex items-center gap-2">
                {ripple ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPlay((n) => n + 1)}
                    data-testid="crosswind-replay"
                  >
                    <RotateCcw />
                    Replay
                  </Button>
                ) : null}
                <Tabs
                  value={view}
                  onValueChange={(next) => setView(next as "after" | "before")}
                >
                  <TabsList>
                    <TabsTrigger value="after">After</TabsTrigger>
                    <TabsTrigger value="before" disabled={!impact.before}>
                      Before
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </span>
            </span>
          }
        >
          {shown && shown.components.length > 0 ? (
            <LayoutGroup id={`crosswind-${view}`}>
              <ArchitectureDiagram
                components={asParts(shown)}
                connections={shown.connections}
                showWorkspace
                marks={view === "after" ? marks : removedMarks}
                flight={ripple ? { plan: ripple, play } : undefined}
              />
            </LayoutGroup>
          ) : (
            <p className="text-[0.8125rem] text-muted-foreground">
              {view === "before"
                ? "No earlier audit of this project to compare with."
                : "The architecture could not be drawn."}
            </p>
          )}
          <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {(Object.keys(EFFECT_TONE) as ImpactEffect[]).map((effect) => (
              <span key={effect} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-1 rounded-sm"
                  style={{ background: EFFECT_TONE[effect] }}
                />
                {EFFECT_LABEL[effect]}
              </span>
            ))}
          </p>
        </Section>

        <Section title={`Parts touched · ${impact.components.length}`}>
          {impact.components.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              No part of the architecture was matched to the change.
            </p>
          ) : (
            <ul
              className="space-y-2.5 text-[0.8125rem]"
              data-testid="crosswind-parts"
            >
              {impact.components.map((part) => (
                <li key={`${part.id}-${part.effect}`} className="flex gap-2">
                  <Dot color={EFFECT_TONE[part.effect]} />
                  <span className="min-w-0">
                    <span className="font-medium">{part.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {EFFECT_LABEL[part.effect].toLowerCase()}
                    </span>
                    {part.note ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {part.note}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {impact.connections.length > 0 ? (
            <ul className="mt-4 space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
              {impact.connections.map((line) => (
                <li
                  key={`${line.from}-${line.to}-${line.effect}`}
                  className="flex gap-2"
                >
                  <Dot color={EFFECT_TONE[line.effect]} />
                  {line.from} → {line.to} ({line.effect})
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Known issues it fixes · ${impact.fixes.length}`}>
          {impact.fixes.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              None of the project&apos;s open issues.
            </p>
          ) : (
            <ul className="space-y-2.5 text-[0.8125rem]">
              {impact.fixes.map((fix) => (
                <li key={fix.issueId} className="flex gap-2">
                  <Dot color="var(--ok)" />
                  <span>
                    <span className="font-medium">{fix.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fix.reason}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={
            <span className="flex items-center justify-between gap-3">
              Review for the pull request
              {impact.review ? <CopyReview text={impact.review} /> : null}
            </span>
          }
        >
          <pre className="max-h-72 overflow-auto font-sans text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
            {impact.review || "No review was written."}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Windtunnel does not post it: copy it to the pull request yourself.
          </p>
        </Section>
      </div>

      {change.files.length > 0 ? (
        <Section title={`Files in the change · ${change.files.length}`}>
          <ul className="divide-y font-mono text-xs">
            {change.files.map((file) => (
              <li key={file.path} className="flex items-center gap-3 py-1.5">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {file.status}
                </span>
                <span className="min-w-0 flex-1 truncate">{file.path}</span>
                <span className="text-ok tabular-nums">+{file.additions}</span>
                <span className="text-sev-critical tabular-nums">
                  −{file.deletions}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

// ── Fly-off ─────────────────────────────────────────────────────────────────

export function FlyoffReport({ run }: { run: RunRecord }) {
  const flyoff = run.flyoff;
  if (!flyoff) return null;
  const verdict = flyoff.verdict;
  const winner = flyoff.blueprints.find(
    (item) => item.id === verdict?.winnerId,
  );
  const nameOf = (id: string) =>
    flyoff.blueprints.find((item) => item.id === id)?.proposer ?? id;

  return (
    <div className="space-y-4" data-testid="flyoff-report">
      {verdict && winner?.blueprint ? (
        <Section
          title={
            <span className="flex items-center gap-2">
              <Trophy className="size-3.5 text-brand" aria-hidden="true" />
              {winner.proposer}&apos;s {winner.blueprint.name} wins
            </span>
          }
          testId="flyoff-verdict"
        >
          <p className="max-w-3xl text-[0.8125rem] leading-relaxed">
            {verdict.summary}
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs text-muted-foreground">Ranking</h4>
              <ol className="space-y-2 text-[0.8125rem]">
                {verdict.ranking.map((item) => (
                  <li key={item.blueprintId} className="flex gap-2">
                    <span className="w-4 font-mono text-xs text-muted-foreground">
                      {item.rank}
                    </span>
                    <span>
                      <span className="font-medium">
                        {nameOf(item.blueprintId)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {item.reason}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h4 className="mb-2 text-xs text-muted-foreground">
                First steps
              </h4>
              <ol className="list-decimal space-y-1.5 pl-4 text-[0.8125rem]">
                {verdict.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </Section>
      ) : null}
      {flyoff.flights && Object.keys(flyoff.flights).length > 0 ? (
        <Section title="In the tunnel" testId="flyoff-flights">
          <p className="mb-4 max-w-3xl text-xs text-muted-foreground">
            Each blueprint was flown before the judge decided: the five agents
            attacked it, each with its own goal.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {flyoff.blueprints
              .filter((item) => flyoff.flights?.[item.id])
              .map((item) => {
                const flight = flyoff.flights![item.id];
                const won = item.id === verdict?.winnerId;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-md border p-3.5",
                      won && "border-brand/50",
                    )}
                    data-testid="flyoff-flight"
                  >
                    <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium">
                      {won ? (
                        <Trophy
                          className="size-3.5 text-brand"
                          aria-label="Winner"
                        />
                      ) : null}
                      {item.proposer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.blueprint?.name}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {(["critical", "high", "medium", "low"] as const).map(
                        (severity) => {
                          const n = flight.findings.filter(
                            (finding) => finding.severity === severity,
                          ).length;
                          return n > 0 ? (
                            <span
                              key={severity}
                              className="flex items-center gap-1"
                            >
                              <Dot color={SEVERITY_TONE[severity]} />
                              {n} {SEVERITY_LABEL[severity].toLowerCase()}
                            </span>
                          ) : null;
                        },
                      )}
                      {flight.findings.length === 0 ? (
                        <span className="text-muted-foreground">
                          {flight.error ?? "Nothing failed"}
                        </span>
                      ) : null}
                    </p>
                    <ul className="mt-2.5 space-y-1.5">
                      {flight.findings.map((finding) => (
                        <li
                          key={finding.title}
                          className="flex gap-2 text-xs leading-snug"
                        >
                          <Dot color={SEVERITY_TONE[finding.severity]} />
                          <span>{finding.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {flyoff.blueprints.map((entry) => {
          const critiques = flyoff.critiques.filter(
            (item) => item.blueprintId === entry.id,
          );
          const won = entry.id === verdict?.winnerId;
          return (
            <Section
              key={entry.id}
              className={cn(won && "border-brand/40")}
              testId="flyoff-blueprint"
              title={
                <span className="flex items-center justify-between gap-2">
                  <span>
                    {entry.proposer}
                    {entry.blueprint ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {entry.blueprint.name}
                      </span>
                    ) : null}
                  </span>
                  {won ? (
                    <span className="text-xs font-normal text-brand">
                      Winner
                    </span>
                  ) : null}
                </span>
              }
            >
              <p className="text-xs text-muted-foreground">{entry.angle}</p>
              {entry.blueprint ? (
                <div className="mt-3 space-y-4 text-[0.8125rem]">
                  <p className="leading-relaxed">{entry.blueprint.summary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.blueprint.components.map((part) => (
                      <span
                        key={part.name}
                        title={part.description}
                        className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {part.name}
                      </span>
                    ))}
                  </div>
                  {entry.blueprint.decisions.length > 0 ? (
                    <div>
                      <h4 className="mb-1.5 text-xs text-muted-foreground">
                        Decisions
                      </h4>
                      <ul className="space-y-2">
                        {entry.blueprint.decisions.map((item) => (
                          <li key={item.decision}>
                            <span className="font-medium">{item.decision}</span>
                            <span className="block text-xs text-muted-foreground">
                              {item.why} · gives up: {item.tradeoff}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {critiques.length > 0 ? (
                    <div>
                      <h4 className="mb-1.5 text-xs text-muted-foreground">
                        What the others said
                      </h4>
                      <ul className="space-y-1.5 text-xs">
                        {critiques.flatMap((item) => [
                          ...item.strengths.map((point) => (
                            <li
                              key={`${item.from}-s-${point}`}
                              className="flex gap-2"
                            >
                              <Dot color="var(--ok)" />
                              {point}
                            </li>
                          )),
                          ...item.weaknesses.map((weak) => (
                            <li
                              key={`${item.from}-w-${weak.point}`}
                              className="flex gap-2"
                            >
                              <Dot color={SEVERITY_TONE[weak.severity]} />
                              {weak.point}
                            </li>
                          )),
                        ])}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-[0.8125rem] text-muted-foreground">
                  {entry.error ?? "No blueprint."}
                </p>
              )}
            </Section>
          );
        })}
      </div>
    </div>
  );
}

// ── Black box ───────────────────────────────────────────────────────────────

export function BlackboxReport({
  run,
  tracked,
  map = null,
}: {
  run: RunRecord;
  tracked: Record<string, TrackedState>;
  /** The project's latest map, to draw the failing request on. */
  map?: Architecture | null;
}) {
  const triage = run.triage;
  const [prOpen, setPrOpen] = useState(false);
  const [play, setPlay] = useState(0);
  const route = triage?.route ?? [];
  const routePlan =
    route.length > 0 && map
      ? {
          cut: [],
          hops: hopsAlong(
            route.map((step, index) => ({
              id: `step-${index + 1}`,
              label: step.step,
              location: step,
              tone:
                index === route.length - 1
                  ? ("danger" as const)
                  : ("accent" as const),
            })),
            map,
          ),
        }
      : null;
  const record = run.remediations?.["incident-1"];
  const issue = tracked["incident-1"];
  const canOpen =
    record?.status === "made" &&
    record.edits.length > 0 &&
    issue &&
    (issue.state === "open" || issue.state === "reopened");

  return (
    <div className="space-y-4" data-testid="blackbox-report">
      <Section title="The production feedback">
        <pre className="max-h-48 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {run.incident}
        </pre>
      </Section>

      {triage ? (
        <Section
          title={
            <span className="flex flex-wrap items-center gap-2">
              {triage.title}
              <span className="text-xs font-normal text-muted-foreground">
                {SEVERITY_LABEL[triage.severity]} ·{" "}
                {FINDING_TYPE_LABEL[triage.type]} · {triage.confidence}{" "}
                confidence
              </span>
            </span>
          }
          testId="blackbox-triage"
        >
          <p className="max-w-3xl text-[0.8125rem] leading-relaxed">
            {triage.hypothesis}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Affects: {triage.affects}
          </p>
          {triage.suspects.length > 0 ? (
            <div className="mt-4 space-y-3">
              {triage.suspects.map((suspect) => (
                <div key={`${suspect.path}:${suspect.startLine}`}>
                  <p className="font-mono text-xs">
                    {suspect.path}:{suspect.startLine}-{suspect.endLine}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {suspect.why}
                  </p>
                  <pre className="mt-1.5 overflow-x-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
                    {suspect.quote}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[0.8125rem] text-muted-foreground">
              No lines in the code could be named.
            </p>
          )}
          {triage.checks.length > 0 ? (
            <div className="mt-4">
              <h4 className="mb-1.5 text-xs text-muted-foreground">
                To confirm it
              </h4>
              <ol className="list-decimal space-y-1 pl-4 text-[0.8125rem]">
                {triage.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </Section>
      ) : null}

      {record ? (
        <Section
          title={
            <span className="flex items-center justify-between gap-3">
              The fix
              {canOpen ? (
                <Button
                  size="sm"
                  onClick={() => setPrOpen(true)}
                  data-testid="blackbox-open-pr"
                >
                  <GitPullRequest />
                  Open A Pull Request
                </Button>
              ) : null}
            </span>
          }
        >
          <Remediation record={record} />
          {issue && canOpen ? (
            <PullRequestDialog
              issueId={issue.id}
              open={prOpen}
              onOpenChange={setPrOpen}
              demo={run.sample}
              fixCost="This fix is already written; opening the pull request costs nothing."
            />
          ) : null}
        </Section>
      ) : null}
      {route.length > 0 ? (
        <Section
          title={
            <span className="flex items-center justify-between gap-3">
              The failing request
              {routePlan ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPlay((n) => n + 1)}
                  data-testid="blackbox-route-replay"
                >
                  <RotateCcw />
                  Replay
                </Button>
              ) : null}
            </span>
          }
          testId="blackbox-route"
        >
          {routePlan && map ? (
            <div className="mb-4">
              <LayoutGroup id="blackbox-route">
                <ArchitectureDiagram
                  components={asParts(map)}
                  connections={map.connections}
                  showWorkspace={false}
                  flight={{ plan: routePlan, play }}
                />
              </LayoutGroup>
            </div>
          ) : null}
          <ol className="space-y-2 text-[0.8125rem]">
            {route.map((step, index) => (
              <li key={`${step.path}:${step.startLine}`} className="flex gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[0.6875rem] text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  {step.step}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {step.path}:{step.startLine}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
      {run.dogfight && run.dogfight.rounds.length > 0 ? (
        <Section
          title={
            run.dogfight.held
              ? `The fix held against the attacker after ${run.dogfight.rounds.length === 1 ? "1 round" : `${run.dogfight.rounds.length} rounds`}`
              : `The attacker still gets past the fix`
          }
          testId="blackbox-duel"
        >
          <DuelRounds fight={run.dogfight} />
        </Section>
      ) : null}
    </div>
  );
}
