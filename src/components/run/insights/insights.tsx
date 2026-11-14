"use client";

import { useState } from "react";

import type { AgentId } from "@/lib/agents";
import { issueRows } from "@/lib/viz/insights";
import {
  agentStandings,
  designSpecified,
  whatChanged,
} from "@/lib/viz/run-widgets";
import type { RunRecord } from "@/server/engine/schema";

import { VersionWidget } from "@/components/run/refine/versions";
import type { RunContext } from "../run-view";
import { NotAccepted } from "../run-report";
import type { ReportTab } from "../story/story";
import { IssueList } from "./issue-list";
import {
  AgentsWidget,
  ChangesWidget,
  DeliveryWidget,
  DesignWidget,
} from "./rail";

/*
 * A finished run's issues as an insights page: the list on the left, a
 * column of widgets on the right (design specified, what changed, agents,
 * delivery), and what was not accepted at the end. On a narrow screen the
 * column moves under the list.
 */

export function Insights({
  run,
  context,
  onOpen,
}: {
  run: RunRecord;
  context: RunContext;
  onOpen: (tab: ReportTab) => void;
}) {
  const [agent, setAgent] = useState<AgentId | null>(null);
  const rows = issueRows(run);
  const design = designSpecified(run);
  const changes = whatChanged(run, context.previous, context.previousSeverity);
  const standings = agentStandings(run);
  const picked = standings.find((item) => item.id === agent) ?? null;
  // A pull request needs code from GitHub; what a fresh fix costs comes
  // from this run's own remediation stage.
  const github =
    run.source?.origin.kind === "github" ||
    (run.source?.workspaces ?? []).some(
      (item) => item.origin.kind === "github",
    );
  const fixes = Object.values(run.remediations ?? {}).length;
  const used = run.usage.remediation;
  const perFix =
    used && fixes
      ? Math.round((used.inputTokens + used.outputTokens) / fixes)
      : null;
  const pr = github
    ? {
        demo: run.sample,
        fixCost: `The fix agent calls ${run.models.reasoning} on your API key${
          perFix
            ? `: in this run a fix used about ${perFix.toLocaleString("en")} tokens.`
            : "."
        }`,
      }
    : null;

  return (
    <div className="space-y-8">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <IssueList
          rows={rows}
          probable={!run.source}
          tracked={context.tracked}
          pr={pr}
          agent={picked ? { id: picked.id, name: picked.name } : null}
          onClearAgent={() => setAgent(null)}
        />
        <aside
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"
          aria-label="Summary"
        >
          {design ? (
            <DesignWidget score={design.score} parts={design.parts} />
          ) : null}
          {context.parent?.changes ? (
            <VersionWidget
              number={context.parent.number}
              changes={context.parent.changes}
            />
          ) : changes.length > 0 ? (
            <ChangesWidget changes={changes} />
          ) : null}
          {standings.length > 0 ? (
            <AgentsWidget
              standings={standings}
              selected={agent}
              onSelect={setAgent}
            />
          ) : null}
          <DeliveryWidget
            workOrders={run.workOrders.length}
            sent={context.sent}
            linked={context.sent !== null}
            onOpen={() => onOpen("work-orders")}
          />
        </aside>
      </div>
      <NotAccepted run={run} />
    </div>
  );
}
