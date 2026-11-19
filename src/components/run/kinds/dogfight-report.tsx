"use client";

import Link from "next/link";
import { Check, Shield, X } from "lucide-react";

import { Panel } from "@/components/panel";
import { Remediation } from "@/components/run/remediation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RunDogfight, RunRecord } from "@/server/engine/schema";

/*
 * A Dogfight, round by round: what the defender changed, and whether the
 * attacker got past it, with the lines of the fixed code that show the way
 * through. Black Box shows the same rounds under its fix.
 */

const linesOf = (location: {
  path: string;
  startLine: number;
  endLine: number;
}) =>
  `${location.path}:${location.startLine}${location.endLine > location.startLine ? `-${location.endLine}` : ""}`;

export function DuelRounds({ fight }: { fight: RunDogfight }) {
  return (
    <ol className="divide-y border-t" data-testid="duel-rounds">
      {fight.rounds.map((round) => (
        <li key={round.n} className="py-3.5">
          <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]">
            <span className="grid size-6 place-items-center rounded-full border font-mono text-[0.6875rem] text-muted-foreground">
              {round.n}
            </span>
            <span className="min-w-0 text-[0.8125rem]">
              <span className="text-muted-foreground">Defender </span>
              {round.defence.summary}
              {round.defence.from === "run" ? (
                <span className="text-muted-foreground">
                  {" "}
                  (the fix the run wrote)
                </span>
              ) : null}
            </span>
            <span className="col-start-2 font-mono text-xs text-muted-foreground sm:col-start-auto sm:text-right">
              {round.defence.edits.length === 1
                ? "1 edit"
                : `${round.defence.edits.length} edits`}
            </span>
          </div>
          {round.attack ? (
            <div
              className="mt-2.5 grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]"
              data-testid="duel-attack"
              data-verdict={round.attack.verdict}
            >
              <span className="grid place-items-center">
                {round.attack.verdict === "through" ? (
                  <X
                    className="size-4 text-sev-critical"
                    aria-label="Got through"
                  />
                ) : (
                  <Check className="size-4 text-ok" aria-label="Held" />
                )}
              </span>
              <span className="min-w-0 text-[0.8125rem]">
                <span
                  className={cn(
                    round.attack.verdict === "through"
                      ? "text-sev-critical"
                      : "text-ok",
                  )}
                >
                  {round.attack.verdict === "through"
                    ? "Attacker got through: "
                    : "Attacker found no way through: "}
                </span>
                {round.attack.title}.{" "}
                <span className="text-muted-foreground">
                  {round.attack.how}
                </span>
              </span>
              <span className="col-start-2 font-mono text-xs text-muted-foreground sm:col-start-auto sm:text-right">
                {round.attack.location
                  ? `${linesOf(round.attack.location)}, fixed`
                  : "held"}
              </span>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function DogfightReport({ run }: { run: RunRecord }) {
  const fight = run.dogfight;
  if (!fight) return null;
  const fix = run.remediations?.[fight.target.groupId];
  const rounds = fight.rounds.length;
  return (
    <div className="space-y-4">
      <Panel className="p-5 md:p-6" data-testid="dogfight-report">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <p className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
              Dogfight · {fight.target.title}
            </p>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">
              {fight.held
                ? `The fix held after ${rounds === 1 ? "1 round" : `${rounds} rounds`}`
                : `The attacker still gets through after ${rounds === 1 ? "1 round" : `${rounds} rounds`}`}
            </h2>
            {fight.target.location ? (
              <p className="font-mono text-xs text-muted-foreground">
                {linesOf(fight.target.location)}
              </p>
            ) : null}
          </div>
          {fight.held && run.projectId ? (
            <Link
              href={`/app/projects/${run.projectId}?tab=issues`}
              className={buttonVariants({ size: "sm" })}
              data-testid="dogfight-open-issue"
            >
              <Shield />
              Open The Issue
            </Link>
          ) : null}
        </div>
        {fight.held ? (
          <p className="mt-3 max-w-3xl text-xs text-muted-foreground">
            This fix is now the issue&apos;s fix: its pull request opens from
            the issue, and says the fix held against the attacker.
          </p>
        ) : null}
        <div className="mt-5">
          <DuelRounds fight={fight} />
        </div>
      </Panel>
      {fix ? (
        <Panel className="p-5 md:p-6">
          <h3 className="mb-3 text-[0.8125rem] font-medium">
            The fix, every round together
          </h3>
          <Remediation record={fix} />
        </Panel>
      ) : null}
    </div>
  );
}
