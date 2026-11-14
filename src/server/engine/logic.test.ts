import { describe, expect, it } from "vitest";

import { findCoverage, modelIds, normalizeModel } from "./coverage";
import { parseRunInput } from "./input";
import { readProgress } from "./progress";
import { SAMPLE_SCRIPT } from "./sample";
import type { AgentReport, AgentRun, DesignModel, Finding } from "./schema";
import { scoreAgents } from "./score";
import {
  checkAgentReport,
  checkWorkOrders,
  reconcileVerdict,
} from "./validate";

const sampleModel = () =>
  structuredClone(
    (SAMPLE_SCRIPT.model as { value: DesignModel }).value,
  ) as DesignModel;

describe("normalizeModel", () => {
  it("leaves a sound model alone", () => {
    const { model, warnings } = normalizeModel(sampleModel());
    expect(warnings).toEqual([]);
    expect(model).toEqual(sampleModel());
  });

  it("drops repeated ids and references to things that are not there", () => {
    const broken = sampleModel();
    broken.roles.push({ ...broken.roles[0] });
    broken.permissions.push({
      operationId: "op-missing",
      roleId: "role-member",
      effect: "allow",
      condition: null,
      source: "stated",
    });
    broken.permissions.push({ ...broken.permissions[0] });
    broken.journeys[0].operationIds.push("op-nowhere");
    broken.journeys.push({
      ...broken.journeys[0],
      id: "jrn-ghost",
      roleId: "role-ghost",
    });
    broken.operations[0].entityIds.push("ent-nowhere");

    const { model, warnings } = normalizeModel(broken);
    expect(model).toEqual(sampleModel());
    expect(warnings).toHaveLength(6);
  });
});

describe("findCoverage", () => {
  const coverage = findCoverage(sampleModel());
  const count = (kind: string) =>
    coverage.gaps.filter((gap) => gap.kind === kind).length;

  it("finds every operation and role pair with no rule", () => {
    // 4 operations x 3 roles, 2 of them specified.
    expect(coverage.stats.permissionCells).toBe(12);
    expect(coverage.stats.specifiedCells).toBe(2);
    expect(count("permission_unspecified")).toBe(10);
  });

  it("finds missing failure behaviour, limits and journeys", () => {
    expect(count("failure_unspecified")).toBe(4);
    expect(count("limit_unspecified")).toBe(3);
    expect(count("operation_without_journey")).toBe(2);
    expect(count("role_without_journey")).toBe(2);
    expect(coverage.gaps).toHaveLength(21);
  });

  it("numbers the gaps and counts stated against assumed items", () => {
    expect(coverage.gaps.map((gap) => gap.id).slice(0, 2)).toEqual([
      "gap-1",
      "gap-2",
    ]);
    expect(coverage.stats.assumedItems + coverage.stats.statedItems).toBe(14);
    expect(coverage.stats.assumedItems).toBe(5);
  });

  it("flags a conditional permission that gives no condition", () => {
    const model = sampleModel();
    model.permissions[0].effect = "conditional";
    expect(
      findCoverage(model).gaps.filter(
        (gap) => gap.kind === "condition_missing",
      ),
    ).toHaveLength(1);
  });
});

const report: AgentReport = {
  scenarios: [
    {
      id: "s1",
      title: "A scenario",
      roleId: null,
      intent: "",
      steps: [
        {
          action: "a",
          operationId: null,
          outcome: "undefined",
          detail: "",
          refs: [],
        },
        {
          action: "b",
          operationId: null,
          outcome: "defined",
          detail: "",
          refs: [],
        },
      ],
    },
  ],
  findings: [
    {
      id: "f1",
      type: "missing_requirement",
      title: "Good",
      description: "",
      severity: "high",
      evidence: [
        { scenarioId: "s1", step: 2 },
        { scenarioId: "s1", step: 3 },
        { scenarioId: "s9", step: 1 },
      ],
      refs: ["op-invite-user", "op-invented"],
      suggestion: "",
    },
    {
      id: "f2",
      type: "missing_requirement",
      title: "No evidence that exists",
      description: "",
      severity: "low",
      evidence: [{ scenarioId: "s1", step: 0 }],
      refs: [],
      suggestion: "",
    },
    {
      id: "f1",
      type: "missing_requirement",
      title: "Same id again",
      description: "",
      severity: "low",
      evidence: [{ scenarioId: "s1", step: 1 }],
      refs: [],
      suggestion: "",
    },
  ],
};

describe("checkAgentReport", () => {
  const { findings, dropped } = checkAgentReport(
    "chaos",
    report,
    modelIds(sampleModel()),
  );

  it("keeps a finding with real evidence and removes its false citations", () => {
    expect(findings).toHaveLength(1);
    expect(findings[0].uid).toBe("chaos/f1");
    expect(findings[0].evidence).toEqual([{ scenarioId: "s1", step: 2 }]);
    expect(findings[0].refs).toEqual(["op-invite-user"]);
  });

  it("drops findings with no real evidence or a reused id, with the reason", () => {
    expect(dropped.map((item) => item.title)).toEqual([
      "No evidence that exists",
      "Same id again",
    ]);
    expect(dropped[0].reason).toMatch(/no scenario step/);
  });
});

const finding = (
  uid: string,
  severity: Finding["severity"] = "high",
): Finding => {
  const [agentId, id] = uid.split("/");
  return {
    uid,
    agentId: agentId as Finding["agentId"],
    id,
    type: "missing_requirement",
    title: `Finding ${uid}`,
    description: `About ${uid}`,
    severity,
    evidence: [{ scenarioId: "s1", step: 1 }],
    refs: [],
    suggestion: "",
  };
};

describe("reconcileVerdict", () => {
  const findings = [
    finding("chaos/f1"),
    finding("scale/f1"),
    finding("scale/f2"),
    finding("chaos/f2", "low"),
  ];
  const { groups, rejected } = reconcileVerdict(
    {
      groups: [
        {
          id: "g1",
          title: "Merged",
          type: "architecture_weakness",
          severity: "critical",
          summary: "",
          findingIds: ["chaos/f1", "scale/f1", "ghost/f1"],
        },
        {
          id: "g1",
          title: "Reuses an id and a finding",
          type: "missing_requirement",
          severity: "low",
          summary: "",
          findingIds: ["chaos/f1", "scale/f2"],
        },
        {
          id: "g3",
          title: "Only invented findings",
          type: "missing_requirement",
          severity: "low",
          summary: "",
          findingIds: ["ghost/f2"],
        },
      ],
      rejected: [
        { findingId: "scale/f1", reason: "already grouped" },
        { findingId: "ghost/f3", reason: "invented" },
      ],
    },
    findings,
  );

  it("places every finding exactly once and ignores invented ids", () => {
    const placed = [
      ...groups.flatMap((group) => group.findingIds),
      ...rejected.map((item) => item.findingId),
    ].sort();
    expect(placed).toEqual(findings.map((item) => item.uid).sort());
    expect(groups[0].findingIds).toEqual(["chaos/f1", "scale/f1"]);
    expect(rejected).toEqual([]);
  });

  it("keeps what the judge skipped, marked as not reviewed", () => {
    const skipped = groups.find((group) => group.findingIds[0] === "chaos/f2");
    expect(skipped).toMatchObject({ reviewed: false, severity: "low" });
  });

  it("gives every group its own id", () => {
    const ids = groups.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("g1-2");
  });
});

describe("checkWorkOrders", () => {
  it("removes links to unknown groups and lists uncovered groups", () => {
    const groups = [{ id: "g1" }, { id: "g2" }, { id: "g3" }] as Parameters<
      typeof checkWorkOrders
    >[1];
    const order = (id: string, groupIds: string[]) => ({
      id,
      title: id,
      priority: "p1" as const,
      description: "",
      acceptanceCriteria: [],
      groupIds,
    });
    const checked = checkWorkOrders(
      [order("wo-1", ["g1", "g9"]), order("wo-2", ["g8"])],
      groups,
    );
    expect(checked.workOrders).toHaveLength(1);
    expect(checked.workOrders[0].groupIds).toEqual(["g1"]);
    expect(checked.unaddressedGroupIds).toEqual(["g2", "g3"]);
  });
});

describe("scoreAgents", () => {
  const agent = (agentId: AgentRun["agentId"], uids: string[]): AgentRun => ({
    agentId,
    status: "done",
    scenarios: [],
    findings: uids.map((uid) => finding(uid)),
    dropped: [],
    usage: null,
    declinedCategory: null,
    error: null,
  });
  const group = (
    id: string,
    severity: Finding["severity"],
    findingIds: string[],
  ) => ({
    id,
    title: id,
    type: "missing_requirement" as const,
    severity,
    summary: "",
    findingIds,
    reviewed: true,
  });

  const board = scoreAgents(
    [
      agent("chaos", ["chaos/f1", "chaos/f2"]),
      agent("scale", ["scale/f1", "scale/f2"]),
      agent("normal_user", []),
    ],
    [
      group("g1", "critical", ["chaos/f1", "scale/f1"]),
      group("g2", "high", ["chaos/f2"]),
    ],
    [{ findingId: "scale/f2" }],
  );

  it("splits a shared group and rewards a find nobody else made", () => {
    expect(board.map((row) => row.agentId)).toEqual([
      "chaos",
      "scale",
      "normal_user",
    ]);
    expect(board[0]).toMatchObject({ points: 9, accepted: 2, unique: 1 });
    expect(board[1]).toMatchObject({
      points: 4,
      accepted: 1,
      rejected: 1,
      unique: 0,
    });
    expect(board[2]).toMatchObject({ points: 0, accepted: 0 });
  });
});

describe("readProgress", () => {
  const full = JSON.stringify({
    scenarios: [
      { id: "s1", title: 'He said "go"', steps: [] },
      { id: "s2", title: "Second", steps: [] },
    ],
    findings: [{ id: "f1", title: "A flaw" }],
  });

  it("reads the titles that are complete so far", () => {
    const cut = full.indexOf("Second") + 3;
    expect(readProgress(full.slice(0, cut))).toEqual({
      scenarios: ['He said "go"'],
      findings: 0,
    });
  });

  it("counts findings once the answer reaches them", () => {
    expect(readProgress(full)).toEqual({
      scenarios: ['He said "go"', "Second"],
      findings: 1,
    });
  });

  it("copes with an answer that has not started", () => {
    expect(readProgress("")).toEqual({ scenarios: [], findings: 0 });
  });
});

describe("parseRunInput", () => {
  it("accepts a requirement with Markdown files", () => {
    const parsed = parseRunInput({
      requirement: "Build it.",
      documents: [{ name: "prd.md", content: "# PRD" }],
    });
    expect(parsed).toEqual({
      ok: true,
      input: {
        requirement: "Build it.",
        documents: [{ name: "prd.md", content: "# PRD" }],
      },
    });
  });

  it.each([
    [{}, /Enter a requirement/],
    [{ requirement: "   " }, /Enter a requirement/],
    [{ requirement: "x".repeat(20_001) }, /limit is 20,000/],
    [
      { requirement: "x", documents: [{ name: "a.pdf", content: "x" }] },
      /not a/,
    ],
    [
      { requirement: "x", documents: [{ name: "a.md", content: " " }] },
      /empty/,
    ],
    [
      {
        requirement: "x",
        documents: [
          { name: "a.md", content: "x" },
          { name: "a.md", content: "y" },
        ],
      },
      /twice/,
    ],
    [
      {
        requirement: "x",
        documents: [{ name: "a.md", content: "x".repeat(150_001) }],
      },
      /limit for one file/,
    ],
    [null, /JSON object/],
  ])("refuses bad input %#", (body, message) => {
    const parsed = parseRunInput(body);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(message);
  });
});
