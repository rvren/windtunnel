import { AGENT_IDS, agentById, type AgentId } from "@/lib/agents";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/labels";
import type { FileChange } from "@/components/tuff/file-changes";
import type { TraceSpan } from "@/components/tuff/run-trace";
import type { RemediationRecord, RunRecord } from "@/server/engine/schema";

import type { RunTimes } from "./times";

/*
 * Turns a run into what the tuffui widgets take. Pure. Every number comes
 * from the run or its events; when one is unknown it is left out.
 */

const agentName = (id: AgentId) => agentById(id)?.name ?? id;

/**
 * The run as a flame graph: one span per stage, and one per agent inside
 * the agents stage. Tokens are the run's own counts; no cost, since the app
 * knows no prices.
 */
export function traceSpans(run: RunRecord, times: RunTimes): TraceSpan[] {
  if (times.start === null) return [];
  const start = times.start;
  const spans: TraceSpan[] = [];
  for (const stage of STAGE_ORDER) {
    const span = times.stages[stage];
    if (!span) continue;
    const usage = run.usage[stage];
    spans.push({
      id: stage,
      name: STAGE_LABEL[stage],
      kind:
        stage === "agents" ? "agent" : stage === "survey" ? "retrieval" : "llm",
      startMs: span.start - start,
      ...(span.end !== undefined ? { endMs: span.end - start } : {}),
      ...(usage && stage !== "agents"
        ? { tokens: { input: usage.inputTokens, output: usage.outputTokens } }
        : {}),
      status: run.status === "failed" && run.stage === stage ? "error" : "ok",
    });
  }
  for (const id of AGENT_IDS) {
    const span = times.agents[id];
    if (!span || !times.stages.agents) continue;
    const agent = run.agents.find((item) => item.agentId === id);
    spans.push({
      id: `agent:${id}`,
      parentId: "agents",
      name: agentName(id),
      kind: "llm",
      model: run.models.agents,
      startMs: span.start - start,
      ...(span.end !== undefined ? { endMs: span.end - start } : {}),
      ...(agent?.usage
        ? {
            tokens: {
              input: agent.usage.inputTokens,
              output: agent.usage.outputTokens,
            },
          }
        : {}),
      status: agent?.status === "failed" ? "error" : "ok",
    });
  }
  return spans;
}

/** A remediation's checked edits as files and hunks, for a read-only diff. */
export function remediationFiles(record: RemediationRecord): FileChange[] {
  const files = new Map<string, FileChange>();
  record.edits.forEach((edit, index) => {
    const file = files.get(edit.path) ?? {
      id: edit.path,
      path: edit.path,
      status: "modified" as const,
      hunks: [],
    };
    const oldStart = edit.startLine - edit.contextBefore.length;
    const shift = file.hunks.reduce(
      (sum, hunk) =>
        sum +
        hunk.lines.filter((line) => line.type === "add").length -
        hunk.lines.filter((line) => line.type === "remove").length,
      0,
    );
    file.hunks.push({
      id: `${edit.path}#${index}`,
      oldStart,
      newStart: oldStart + shift,
      lines: [
        ...edit.contextBefore.map((text) => ({
          type: "context" as const,
          text,
        })),
        ...edit.before.map((text) => ({ type: "remove" as const, text })),
        ...edit.after.map((text) => ({ type: "add" as const, text })),
        ...edit.contextAfter.map((text) => ({
          type: "context" as const,
          text,
        })),
      ],
    });
    files.set(edit.path, file);
  });
  return [...files.values()];
}

/** Security issues that have a checked patch, of all security issues. */
export function patchCoverage(run: RunRecord) {
  const security = run.groups.filter(
    (group) => group.type === "security_vulnerability",
  );
  const patched = security.filter(
    (group) => (run.remediations?.[group.id]?.edits.length ?? 0) > 0,
  ).length;
  return {
    total: security.length,
    patched,
    ratio: security.length ? patched / security.length : 0,
  };
}
