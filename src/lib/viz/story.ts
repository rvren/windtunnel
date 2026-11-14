import { AGENT_IDS, agentById, type AgentId } from "@/lib/agents";
import {
  GAP_KIND_LABEL,
  SEVERITY_ORDER,
  STAGE_DESCRIPTION,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/lib/labels";
import type { Feed, StageState } from "@/lib/run-feed";
import type { RunRecord, Severity, Stage } from "@/server/engine/schema";

import { stageSplits, type RunTimes } from "./times";

/*
 * The run as a story: one chapter per stage, each with its state and, once
 * the stage is done, what it found. Read from the event feed (what is
 * happening now) and the saved run (what each stage produced). Pure; a
 * chapter whose data is not there yet has no result rather than a made-up
 * one.
 */

export type StoryResult =
  | {
      kind: "survey";
      files: number | null;
      languages: string[];
      workspaces: string[];
    }
  | {
      kind: "model";
      counts: { label: string; value: number }[];
      roles: string[];
      parts: number;
    }
  | {
      kind: "coverage";
      total: number;
      byKind: { label: string; value: number }[];
    }
  | {
      kind: "agents";
      total: number;
      byAgent: { id: AgentId; name: string; findings: number }[];
    }
  | { kind: "challenge"; disputes: number; supports: number }
  | {
      kind: "judge";
      accepted: number;
      rejected: number;
      bySeverity: Record<Severity, number>;
      top: { id: string; title: string; severity: Severity }[];
    }
  | {
      kind: "remediation";
      made: number;
      patched: number;
      security: number;
      /** False for a run that read no code: there is nothing to patch. */
      code: boolean;
    }
  | { kind: "work_orders"; total: number };

export interface Chapter {
  stage: Stage;
  label: string;
  state: StageState;
  /** What the stage is doing, while it runs; its summary once done. */
  line: string;
  /** Seconds it took, once it finished. */
  seconds: number | null;
  /** Set once the stage is done and the saved run has its output. */
  result: StoryResult | null;
}

const count = <T>(items: T[] | undefined) => items?.length ?? 0;

function resultOf(stage: Stage, run: RunRecord): StoryResult | null {
  switch (stage) {
    case "survey":
      return run.source
        ? {
            kind: "survey",
            files: run.source.files,
            languages: run.source.languages,
            workspaces: run.source.workspaces?.map((item) => item.name) ?? [],
          }
        : null;
    case "model": {
      const model = run.designModel;
      if (!model) return null;
      return {
        kind: "model",
        counts: [
          { label: "roles", value: count(model.roles) },
          { label: "operations", value: count(model.operations) },
          { label: "rules", value: count(model.rules) },
          { label: "journeys", value: count(model.journeys) },
        ],
        roles: model.roles.map((role) => role.name),
        parts: run.source?.architecture?.components.length ?? 0,
      };
    }
    case "coverage": {
      if (!run.coverage) return null;
      const byKind = new Map<string, number>();
      for (const gap of run.coverage.gaps) {
        byKind.set(gap.kind, (byKind.get(gap.kind) ?? 0) + 1);
      }
      return {
        kind: "coverage",
        total: run.coverage.gaps.length,
        byKind: [...byKind.entries()]
          .map(([kind, value]) => ({
            label: GAP_KIND_LABEL[kind as keyof typeof GAP_KIND_LABEL] ?? kind,
            value,
          }))
          .sort((a, b) => b.value - a.value),
      };
    }
    case "agents": {
      const byAgent = AGENT_IDS.flatMap((id) => {
        const agent = run.agents.find((item) => item.agentId === id);
        return agent
          ? [
              {
                id,
                name: agentById(id)?.name ?? id,
                findings: agent.findings.length,
              },
            ]
          : [];
      });
      if (byAgent.length === 0) return null;
      return {
        kind: "agents",
        total: byAgent.reduce((sum, item) => sum + item.findings, 0),
        byAgent,
      };
    }
    case "challenge": {
      if (!run.challenges) return null;
      return {
        kind: "challenge",
        disputes: run.challenges.filter((c) => c.stance === "dispute").length,
        supports: run.challenges.filter((c) => c.stance === "support").length,
      };
    }
    case "judge": {
      const bySeverity = Object.fromEntries(
        SEVERITY_ORDER.map((severity) => [
          severity,
          run.groups.filter((group) => group.severity === severity).length,
        ]),
      ) as Record<Severity, number>;
      const top = [...run.groups]
        .sort(
          (a, b) =>
            SEVERITY_ORDER.indexOf(a.severity) -
            SEVERITY_ORDER.indexOf(b.severity),
        )
        .slice(0, 3)
        .map(({ id, title, severity }) => ({ id, title, severity }));
      return {
        kind: "judge",
        accepted: run.groups.length,
        rejected: run.rejected.length,
        bySeverity,
        top,
      };
    }
    case "remediation": {
      const records = Object.values(run.remediations ?? {});
      return {
        kind: "remediation",
        made: records.filter((record) => record.status === "made").length,
        patched: records.filter((record) => record.edits.length > 0).length,
        security: run.groups.filter(
          (group) => group.type === "security_vulnerability",
        ).length,
        code: Boolean(run.source),
      };
    }
    case "work_orders":
      return { kind: "work_orders", total: run.workOrders.length };
  }
}

/** The stages this run goes through, as chapters, in order. */
/**
 * A requirement run's stage summaries, in its own words: the engine saved
 * them as text, so older runs are reworded when shown.
 */
export function probableSummary(text: string): string {
  return text
    .replace(/\bfindings? accepted\b/g, (match) =>
      match.startsWith("findings") ? "risks kept" : "risk kept",
    )
    .replace(/\bremediations?\b/g, (match) =>
      match.endsWith("s") ? "suggested changes" : "suggested change",
    )
    .replace(/\bNo security findings\b/g, "No security risks")
    .replace(/\bNo work orders needed\b/g, "No work orders proposed")
    .replace(
      /\b(\d+) work orders?\b/g,
      (match, count) =>
        `${count} proposed ${Number(count) === 1 ? "work order" : "work orders"}`,
    );
}

export function storyOf(
  run: RunRecord,
  feed: Feed,
  times: RunTimes,
): Chapter[] {
  const splits = stageSplits(times);
  const code = Boolean(run.source);
  return STAGE_ORDER.filter((stage) => code || stage !== "survey")
    .filter(
      // Remediation is only part of runs that have it; older runs skip it.
      (stage) =>
        stage !== "remediation" ||
        feed.stages.remediation.state !== "pending" ||
        run.remediations !== undefined ||
        run.status === "running",
    )
    .map((stage) => {
      const live = feed.stages[stage];
      // A finished run that was opened later may have no replayed state for
      // a stage it went through: its output says it is done.
      const state: StageState =
        live.state !== "pending"
          ? live.state
          : run.status === "completed"
            ? "done"
            : run.stage === stage && run.status === "failed"
              ? "failed"
              : "pending";
      return {
        stage,
        label: STAGE_LABEL[stage],
        state,
        line:
          state === "done" && live.summary
            ? run.source
              ? live.summary
              : probableSummary(live.summary)
            : state === "failed"
              ? (run.error ?? "This stage failed.")
              : STAGE_DESCRIPTION[stage],
        seconds: splits[stage] ?? null,
        result: state === "done" ? resultOf(stage, run) : null,
      };
    });
}

/** The chapter running now, else the one that failed, else none. */
export function currentChapter(chapters: Chapter[]): Chapter | null {
  return (
    chapters.find((chapter) => chapter.state === "running") ??
    chapters.find((chapter) => chapter.state === "failed") ??
    null
  );
}
