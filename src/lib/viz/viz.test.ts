import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { executeRun, newRun } from "@/server/engine/run";
import { ScriptedLlm } from "@/server/engine/sample";
import {
  SAMPLE_SERVICES,
  sampleProjectScript,
  sampleServiceOf,
} from "@/server/engine/sample-project";
import type { RunRecord, StoredEvent } from "@/server/engine/schema";
import { MemoryRunStore } from "@/server/engine/store";
import { buildCockpit } from "@/server/projects/cockpit";

import { issueFlowView, securityView } from "./cockpit-views";
import { issueRows, kindCounts, searchRows, sortRows } from "./insights";
import { agentStandings, designSpecified, whatChanged } from "./run-widgets";
import { patchCoverage, remediationFiles, traceSpans } from "./run";
import { elapsedSeconds, stageSegments, stageSplits, timesFrom } from "./times";

const SAMPLES = path.resolve(
  import.meta.dirname,
  "../../../samples/storefront",
);

let run: RunRecord;
beforeAll(async () => {
  process.env.WINDTUNNEL_REPOS_DIR = SAMPLES;
  const workspaces = SAMPLE_SERVICES.map((name) => ({
    name,
    origin: { kind: "local" as const, name },
  }));
  const fresh = newRun(
    "run-viz",
    {
      requirement: "",
      documents: [],
      project: { id: "project-1", name: "Storefront", workspaces, demo: true },
    },
    { reasoning: "reasoning-model", agents: "agent-model" },
    new Date("2026-11-13T10:00:00Z"),
    true,
  );
  run = await executeRun(
    {
      llm: new ScriptedLlm(
        sampleProjectScript(
          workspaces.map((item) => ({
            name: item.name,
            service: sampleServiceOf(item.origin),
          })),
        ),
      ),
      store: new MemoryRunStore(),
      publish: () => undefined,
      now: () => new Date("2026-11-13T10:00:05Z"),
    },
    fresh,
  );
});

let seq = 0;
const at = (second: number, event: StoredEvent["event"]): StoredEvent => ({
  seq: seq++,
  at: new Date(Date.UTC(2026, 10, 13, 10, 0, second)).toISOString(),
  event,
});

const EVENTS: StoredEvent[] = [
  at(0, { type: "run.started" }),
  at(0, { type: "stage.started", stage: "survey" }),
  at(2, { type: "stage.completed", stage: "survey", summary: "" }),
  at(2, { type: "stage.started", stage: "model" }),
  at(10, { type: "stage.completed", stage: "model", summary: "" }),
  at(10, { type: "stage.started", stage: "agents" }),
  at(10, { type: "agent.started", agentId: "chaos" }),
  at(11, { type: "agent.started", agentId: "scale" }),
  at(25, {
    type: "agent.completed",
    agentId: "chaos",
    scenarios: 2,
    findings: 3,
    dropped: 0,
  }),
];

describe("times from events", () => {
  const times = timesFrom(EVENTS);

  it("times each finished stage and agent, and leaves running ones open", () => {
    expect(stageSplits(times)).toEqual({ survey: 2, model: 8 });
    expect(times.agents.chaos).toEqual({
      start: Date.parse("2026-11-13T10:00:10Z"),
      end: Date.parse("2026-11-13T10:00:25Z"),
    });
    expect(times.agents.scale?.end).toBeUndefined();
    expect(times.stages.agents?.end).toBeUndefined();
  });

  it("puts the finished stages on one bar, in order", () => {
    expect(stageSegments(times)).toEqual([
      { id: "survey", label: "Survey", seconds: 2 },
      { id: "model", label: "Model", seconds: 8 },
    ]);
    expect(elapsedSeconds(times, Date.parse("2026-11-13T10:00:30Z"))).toBe(30);
  });

  it("ignores events with no time", () => {
    expect(timesFrom([{ ...EVENTS[0], at: "" }]).start).toBeNull();
  });
});

describe("a run, as the widgets see it", () => {
  it("draws the flame graph from the stages and agents that have times", () => {
    const spans = traceSpans(run, timesFrom(EVENTS));
    expect(spans.map((span) => span.id)).toEqual([
      "survey",
      "model",
      "agents",
      "agent:chaos",
      "agent:scale",
    ]);
    expect(spans[1]).toMatchObject({ startMs: 2000, endMs: 10_000 });
    expect(spans.every((span) => span.costUsd === undefined)).toBe(true);
    expect(traceSpans(run, timesFrom([]))).toEqual([]);
  });

  it("turns each checked edit into a hunk with its context", () => {
    const record = Object.values(run.remediations ?? {}).find(
      (item) => item.edits.length > 1,
    )!;
    const files = remediationFiles(record);
    const hunks = files.flatMap((file) => file.hunks);
    expect(hunks).toHaveLength(record.edits.length);
    const edit = record.edits[0];
    expect(hunks[0].oldStart).toBe(edit.startLine - edit.contextBefore.length);
    expect(
      hunks[0].lines.filter((line) => line.type === "remove"),
    ).toHaveLength(edit.before.length);
  });

  it("counts the security issues that have a patch", () => {
    const coverage = patchCoverage(run);
    const security = run.groups.filter(
      (group) => group.type === "security_vulnerability",
    );
    expect(coverage.total).toBe(security.length);
    expect(coverage.patched).toBeLessThanOrEqual(coverage.total);
    expect(coverage.ratio).toBeCloseTo(coverage.patched / coverage.total);
  });
});

describe("the cockpit's canvas views", () => {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  it("draws the issue flow with every issue on both sides of each hub", () => {
    const cockpit = buildCockpit(run);
    const view = issueFlowView(cockpit)!;
    expect(sum(view.sources.map((n) => n.value))).toBe(cockpit.totals.issues);
    expect(sum(view.groups.map((n) => n.value))).toBe(cockpit.totals.issues);
    for (const hub of view.hubs) {
      const into = view.bands.filter((b) => b.target === hub.id);
      const out = view.bands.filter((b) => b.source === hub.id);
      expect(sum(into.map((b) => b.value))).toBe(hub.value);
      expect(sum(out.map((b) => b.value))).toBe(hub.value);
    }
    // A group lists its first issues, and counts the rest.
    for (const group of view.groups) {
      expect(group.leaves.length + group.more).toBe(group.value);
      expect(group.leaves.length).toBeLessThanOrEqual(3);
    }
  });

  it("files security issues under OWASP, patch and severity", () => {
    const cockpit = buildCockpit(run);
    const view = securityView(cockpit)!;
    const security = cockpit.issues.filter(
      (issue) => issue.type === "security_vulnerability",
    );
    expect(sum(view.sources.map((n) => n.value))).toBe(security.length);
    expect(sum(view.hubs.map((n) => n.value))).toBe(security.length);
    const ready = view.hubs.find((hub) => hub.id === "hub:yes")?.value ?? 0;
    expect(ready).toBe(patchCoverage(run).patched);
    expect(view.sources.every((source) => source.filter?.key === "owasp")).toBe(
      true,
    );
  });

  it("leaves a view out when it has nothing to show", () => {
    const empty = {
      ...buildCockpit(run),
      issues: [],
      privacy: null,
    };
    expect(issueFlowView(empty)).toBeNull();
    expect(securityView(empty)).toBeNull();
  });
});

describe("when the agents' work arrived", () => {
  it("marks each new scenario and each finding at its time", () => {
    const at = (second: number, event: StoredEvent["event"]): StoredEvent => ({
      seq: second,
      at: new Date(Date.UTC(2026, 10, 13, 10, 0, second)).toISOString(),
      event,
    });
    const times = timesFrom([
      at(1, { type: "agent.started", agentId: "chaos" }),
      at(2, {
        type: "agent.progress",
        agentId: "chaos",
        scenarios: ["a"],
        findings: 0,
      }),
      // The same scenario list again adds nothing.
      at(3, {
        type: "agent.progress",
        agentId: "chaos",
        scenarios: ["a"],
        findings: 0,
      }),
      at(4, {
        type: "agent.progress",
        agentId: "chaos",
        scenarios: ["a", "b", "c"],
        findings: 0,
      }),
      at(5, {
        type: "agent.finding",
        agentId: "chaos",
        finding: {
          uid: "chaos/f1",
          type: "security_vulnerability",
          severity: "high",
          title: "t",
          path: null,
          startLine: null,
        },
      }),
    ]);
    expect(times.marks.map((m) => m.kind)).toEqual([
      "scenario",
      "scenario",
      "scenario",
      "finding",
    ]);
    expect(times.marks.at(-1)).toMatchObject({ severity: "high" });
    expect(times.marks[1].at).toBe(Date.parse("2026-11-13T10:00:04Z"));
  });
});

describe("a finished run as insights", () => {
  it("makes one row per accepted issue, with its agents, fix and work order", () => {
    const rows = issueRows(run);
    expect(rows).toHaveLength(run.groups.length);
    for (const row of rows) {
      const group = run.groups.find((g) => g.id === row.id)!;
      const filedBy = new Set(
        run.agents
          .filter((a) =>
            a.findings.some((f) => group.findingIds.includes(f.uid)),
          )
          .map((a) => a.agentId),
      );
      expect(new Set(row.agents)).toEqual(filedBy);
      const comments = (run.challenges ?? []).filter((c) =>
        group.findingIds.includes(c.findingId),
      );
      expect(row.challenge.support + row.challenge.dispute).toBe(
        comments.length,
      );
      const edits = run.remediations?.[row.id]?.edits ?? [];
      if (edits.length) {
        expect(row.patch!.added).toBe(
          edits.reduce((s, e) => s + e.after.length, 0),
        );
      } else {
        expect(row.patch).toBeNull();
      }
      const order = run.workOrders.find((w) => w.groupIds.includes(row.id));
      expect(row.workOrder?.id ?? null).toBe(order?.id ?? null);
    }
  });

  it("counts kinds, sorts and searches", () => {
    const rows = issueRows(run);
    const counts = kindCounts(rows);
    expect(counts.reduce((s, k) => s + k.count, 0)).toBe(rows.length);
    const sorted = sortRows(rows, "severity");
    const order = ["critical", "high", "medium", "low"];
    for (let i = 1; i < sorted.length; i += 1) {
      expect(order.indexOf(sorted[i].severity)).toBeGreaterThanOrEqual(
        order.indexOf(sorted[i - 1].severity),
      );
    }
    const first = rows[0];
    const word = first.title.split(" ").find((w) => w.length > 4)!;
    expect(searchRows(rows, word).map((r) => r.id)).toContain(first.id);
    expect(searchRows(rows, "zzzz-nothing")).toHaveLength(0);
    expect(searchRows(rows, "  ")).toHaveLength(rows.length);
  });

  it("states how fully the design is specified, as plain ratios", () => {
    const design = designSpecified(run)!;
    const stats = run.coverage!.stats;
    expect(design.score).toBe(
      Math.round((stats.specifiedCells / stats.permissionCells) * 100),
    );
    expect(design.parts[0]).toMatchObject({
      value: stats.specifiedCells,
      total: stats.permissionCells,
    });
  });

  it("compares with the run before only when there is one", () => {
    expect(whatChanged(run, null, null)).toEqual([]);
    const changes = whatChanged(
      run,
      {
        id: "before",
        projectId: "p",
        parentRunId: null,
        createdAt: "",
        status: "completed",
        stage: null,
        title: "",
        findingCount: 10,
        workOrderCount: 4,
        workspaces: [],
      },
      { critical: 1, high: 2 },
    );
    expect(changes[0]).toMatchObject({
      label: "Issues",
      now: run.groups.length,
      before: 10,
    });
    expect(changes.map((c) => c.label)).toEqual([
      "Issues",
      "Critical",
      "High",
      "Work orders",
    ]);
  });

  it("ranks the agents by points", () => {
    const standings = agentStandings(run);
    expect(standings).toHaveLength(run.scoreboard.length);
    for (let i = 1; i < standings.length; i += 1) {
      expect(standings[i].points).toBeLessThanOrEqual(standings[i - 1].points);
    }
  });
});
