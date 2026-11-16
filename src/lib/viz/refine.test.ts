import { beforeAll, describe, expect, it } from "vitest";

import { executeRun, newRun } from "@/server/engine/run";
import { SAMPLE_SCRIPT, ScriptedLlm } from "@/server/engine/sample";
import type { RunRecord, RunSummary } from "@/server/engine/schema";
import { MemoryRunStore } from "@/server/engine/store";

import {
  decisionsText,
  lineDiff,
  questions,
  threadOf,
  versionChanges,
  withDecisions,
} from "./refine";

let run: RunRecord;
beforeAll(async () => {
  run = await executeRun(
    {
      llm: new ScriptedLlm(SAMPLE_SCRIPT),
      store: new MemoryRunStore(),
      publish: () => {},
      now: () => new Date("2026-11-14T10:00:05Z"),
    },
    newRun(
      "v1",
      { requirement: "A shop.", documents: [] },
      { reasoning: "r", agents: "a" },
      new Date("2026-11-14T10:00:00Z"),
      true,
    ),
  );
});

describe("questions from a requirement run", () => {
  it("asks about every gap, assumption and requirement issue", () => {
    const list = questions(run);
    const gaps = run.coverage!.gaps.length;
    const model = run.designModel!;
    const assumed = [
      ...model.roles,
      ...model.entities,
      ...model.operations,
      ...model.permissions,
      ...model.rules,
      ...model.journeys,
    ].filter((item) => item.source === "assumed").length;
    const issues = run.groups.filter(
      (group) =>
        group.type === "missing_requirement" ||
        group.type === "unhandled_journey",
    ).length;
    expect(list.filter((q) => q.kind === "gap")).toHaveLength(gaps);
    expect(list.filter((q) => q.kind === "assumption")).toHaveLength(assumed);
    expect(list.filter((q) => q.kind === "issue")).toHaveLength(issues);
    // Ids are stable and unique, so a draft can be kept.
    expect(new Set(list.map((q) => q.id)).size).toBe(list.length);
    expect(questions(run).map((q) => q.id)).toEqual(list.map((q) => q.id));
  });

  it("asks nothing of a code run", () => {
    expect(
      questions({
        ...run,
        source: {
          kind: "repository",
          origin: { kind: "local", name: "web" },
          label: "web",
          files: 1,
          languages: [],
        },
      }),
    ).toEqual([]);
  });
});

describe("the Decisions section", () => {
  const list = [
    {
      id: "a",
      kind: "gap" as const,
      section: "s",
      text: "May a Buyer refund?",
    },
    {
      id: "b",
      kind: "assumption" as const,
      section: "s",
      text: "…",
      statement: "there is a role Admin.",
    },
    {
      id: "c",
      kind: "assumption" as const,
      section: "s",
      text: "…",
      statement: "orders expire.",
    },
    { id: "d", kind: "gap" as const, section: "s", text: "Skipped?" },
  ];

  it("writes the owner's answers in their words, skipping the rest", () => {
    expect(
      decisionsText(list, {
        a: { text: "Only within 14 days." },
        b: { keep: true },
        c: { text: "Orders never expire." },
        d: { text: "  " },
      }),
    ).toEqual([
      "- May a Buyer refund? Decision: Only within 14 days.",
      "- Confirmed: there is a role Admin.",
      "- Not as assumed (orders expire.): Orders never expire.",
    ]);
  });

  it("adds a section at the end, or extends the one there", () => {
    expect(withDecisions("A shop.\n", ["- x"])).toBe(
      "A shop.\n\n## Decisions\n\n- x",
    );
    expect(
      withDecisions("A shop.\n\n## Decisions\n\n- x\n\n## Notes\n\nn", ["- y"]),
    ).toBe("A shop.\n\n## Decisions\n\n- x\n- y\n\n## Notes\n\nn");
    expect(withDecisions("A shop.", [])).toBe("A shop.");
  });
});

describe("versions", () => {
  const summary = (
    id: string,
    parentRunId: string | null,
    createdAt: string,
  ): RunSummary => ({
    id,
    projectId: "p",
    kind: "audit",
    costUsd: null,
    counts: null,
    parentRunId,
    createdAt,
    status: "completed",
    stage: null,
    title: id,
    findingCount: 0,
    workOrderCount: 0,
    workspaces: [],
  });

  it("numbers a requirement's versions from any one of them", () => {
    const runs = [
      summary("v3", "v2", "2026-11-14T12:00:00Z"),
      summary("other", null, "2026-11-14T11:30:00Z"),
      summary("v2", "v1", "2026-11-14T11:00:00Z"),
      summary("v1", null, "2026-11-14T10:00:00Z"),
    ];
    const ids = (from: string) =>
      threadOf(runs, from).map((v) => `${v.number}:${v.run.id}`);
    expect(ids("v2")).toEqual(["1:v1", "2:v2", "3:v3"]);
    expect(ids("v1")).toEqual(ids("v3"));
    expect(ids("other")).toEqual(["1:other"]);
    expect(threadOf(runs, "missing")).toEqual([]);
  });

  it("says what got better from one version to the next", () => {
    const [closed, ...rest] = run.coverage!.gaps;
    const model = run.designModel!;
    const assumedRole = model.roles.find((role) => role.source === "assumed");
    const [gone, ...kept] = run.groups;
    const next: RunRecord = {
      ...run,
      id: "v2",
      coverage: {
        ...run.coverage!,
        gaps: [
          ...rest,
          {
            id: "new",
            kind: "limit_unspecified",
            refs: [],
            text: "How many carts?",
          },
        ],
      },
      designModel: {
        ...model,
        roles: model.roles.map((role) => ({
          ...role,
          source: "stated" as const,
        })),
      },
      groups: kept,
    };
    const changes = versionChanges(run, next);
    expect(changes.gaps.closed).toEqual([closed]);
    expect(changes.gaps.opened.map((gap) => gap.id)).toEqual(["new"]);
    expect(changes.issues.gone).toEqual([gone]);
    expect(changes.issues.found).toEqual([]);
    if (assumedRole) {
      expect(changes.nowStated).toContain(
        `Role: ${assumedRole.name.toLowerCase()}`,
      );
    }
    expect(changes.workOrders.before).toBe(run.workOrders.length);
  });
});

describe("comparing two texts line by line", () => {
  it("marks kept, added and removed lines", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" },
    ]);
  });
});
