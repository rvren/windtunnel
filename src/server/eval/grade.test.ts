import { describe, expect, it } from "vitest";

import type { LlmClient } from "../engine/llm";
import {
  codeMatch,
  matchInCode,
  score,
  type Candidate,
  type CaseKey,
  type Verdict,
} from "./grade";
import { judgeLeftovers, matchPrompt } from "./judge";

const key: CaseKey = {
  case: "sf-catalog",
  version: 1,
  flaws: [
    {
      id: "f1",
      title: "Search joins the query text into SQL",
      kind: "security_vulnerability",
      severity: "critical",
      cwe: "CWE-89",
      file: "search.py",
      lines: [12, 18],
      why: "query is formatted into the SQL string",
    },
    {
      id: "f2",
      title: "Product list reads the whole table",
      kind: "architecture_weakness",
      severity: "medium",
      cwe: null,
      file: "products.py",
      lines: [30, 34],
      why: "no LIMIT",
    },
    {
      id: "f3",
      title: "Cache key ignores the user",
      kind: "security_vulnerability",
      severity: "high",
      cwe: null,
      file: "cache.py",
      lines: [5, 9],
      why: "one user's results served to another",
      files: [{ file: "search.py", lines: [40, 44] }],
    },
  ],
};

const candidate = (over: Partial<Candidate> & { uid: string }): Candidate => ({
  agentId: "adversarial_user",
  title: "t",
  description: "d",
  kind: "security_vulnerability",
  severity: "critical",
  place: null,
  accepted: true,
  ...over,
});

/** The key itself, filed as findings: must score 100%. */
const oracle = key.flaws.map((flaw, index) =>
  candidate({
    uid: `oracle/${index}`,
    kind: flaw.kind,
    severity: flaw.severity,
    place: { file: flaw.file, lines: flaw.lines },
  }),
);

describe("matching in code", () => {
  it("needs the same file, nearby lines and the same kind", () => {
    const flaw = key.flaws[0];
    const near = candidate({
      uid: "a",
      place: { file: "./search.py", lines: [20, 22] },
    });
    expect(codeMatch(near, flaw)).toBe(true);
    expect(
      codeMatch(
        { ...near, place: { file: "search.py", lines: [40, 41] } },
        flaw,
      ),
    ).toBe(false);
    expect(codeMatch({ ...near, kind: "architecture_weakness" }, flaw)).toBe(
      false,
    );
    expect(codeMatch({ ...near, place: null }, flaw)).toBe(false);
  });

  it("matches any place of a flaw that spans files", () => {
    expect(
      codeMatch(
        candidate({ uid: "a", place: { file: "search.py", lines: [41, 41] } }),
        key.flaws[2],
      ),
    ).toBe(true);
  });

  it("sends a confident finding about the wrong file to the judge", () => {
    const wrong = candidate({
      uid: "w",
      title: "SQL injection in search",
      place: { file: "orders.py", lines: [12, 18] },
    });
    const { verdicts, leftovers } = matchInCode(key, [wrong]);
    expect(verdicts.size).toBe(0);
    expect(leftovers).toEqual([wrong]);
  });
});

describe("scores", () => {
  it("gives the answer key itself 100%", () => {
    const { verdicts, leftovers } = matchInCode(key, oracle);
    expect(leftovers).toEqual([]);
    const result = score(key, oracle, verdicts);
    expect(result).toMatchObject({
      recall: 1,
      recallReported: 1,
      seriousReported: 1,
      judgeKept: 1,
      precisionReported: 1,
    });
    expect(result.agents[0]).toMatchObject({ recall: 1, precision: 1 });
  });

  it("gives no findings 0%, not a missing score", () => {
    const result = score(key, [], new Map());
    expect(result.recall).toBe(0);
    expect(result.recallReported).toBe(0);
    expect(result.agents).toEqual([]);
  });

  it("scores agents, the report and the judge apart", () => {
    const found = [
      candidate({ uid: "a/1", place: { file: "search.py", lines: [14, 14] } }),
      candidate({
        uid: "b/1",
        agentId: "scale",
        kind: "architecture_weakness",
        severity: "low",
        place: { file: "products.py", lines: [31, 31] },
        accepted: false,
      }),
      candidate({ uid: "b/2", agentId: "scale", accepted: true }),
      candidate({ uid: "a/2", accepted: false }),
      candidate({ uid: "a/3" }),
    ];
    const { verdicts } = matchInCode(key, found);
    const judged = new Map<string, Verdict>([
      ...verdicts,
      ["b/2", { kind: "not_real" }],
      ["a/2", { kind: "not_real" }],
      ["a/3", { kind: "unlisted" }],
    ]);
    const result = score(key, found, judged);
    expect(result.recall).toBeCloseTo(2 / 3);
    // The scale agent's flaw was dropped by the judge: not in the report.
    expect(result.recallReported).toBeCloseTo(1 / 3);
    expect(result.seriousReported).toBeCloseTo(1 / 2);
    expect(result.judgeKept).toBeCloseTo(1 / 2);
    expect(result.judgeDropped).toBeCloseTo(1 / 2);
    expect(result.precisionReported).toBeCloseTo(1 / 2);
    expect(result.unlisted).toBe(1);
    const scale = result.agents.find((item) => item.agentId === "scale")!;
    // "low" against a "medium" flaw is one step off: still agrees.
    expect(scale).toMatchObject({ precision: 0.5, severity: 1, unique: 1 });
    const attacker = result.agents.find(
      (item) => item.agentId === "adversarial_user",
    )!;
    expect(attacker).toMatchObject({ precision: 0.5, unlisted: 1 });
  });
});

describe("the matching judge", () => {
  const leftovers = [
    candidate({ uid: "x/1", title: "SQL injection via the search box" }),
    candidate({ uid: "x/2", title: "Use HTTPS" }),
    candidate({ uid: "x/3", title: "Something" }),
  ];

  const fake = (verdicts: unknown[]): LlmClient => ({
    call: async () =>
      ({
        kind: "ok",
        value: { verdicts },
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      }) as never,
    agent: async () => {
      throw new Error("not used");
    },
  });

  it("keeps sound verdicts and ignores skipped, unknown and invented ones", async () => {
    const { verdicts } = await judgeLeftovers(
      fake([
        { uid: "x/1", verdict: "match", flawId: "f1", reason: "" },
        { uid: "x/2", verdict: "not_real", flawId: null, reason: "" },
        { uid: "x/9", verdict: "unlisted", flawId: null, reason: "" },
        { uid: "x/3", verdict: "match", flawId: "made-up", reason: "" },
      ]),
      key,
      leftovers,
    );
    expect(Object.fromEntries(verdicts)).toEqual({
      "x/1": { kind: "match", flawId: "f1" },
      "x/2": { kind: "not_real" },
    });
  });

  it("asks nothing when code placed every finding", async () => {
    const { verdicts, usage } = await judgeLeftovers(fake([]), key, []);
    expect(verdicts.size).toBe(0);
    expect(usage).toBeNull();
  });

  it("gives the judge every key entry and every leftover as data", () => {
    const prompt = matchPrompt(key, leftovers);
    for (const flaw of key.flaws) expect(prompt).toContain(`id="${flaw.id}"`);
    for (const item of leftovers) expect(prompt).toContain(`uid="${item.uid}"`);
  });
});
