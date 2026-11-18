import { describe, expect, it } from "vitest";

import type { FindingGroup, RunRecord } from "@/server/engine/schema";

import { resultOf } from "./result";

const group = (id: string, severity: FindingGroup["severity"]) =>
  ({ id, title: `T ${id}`, summary: `S ${id}`, severity }) as FindingGroup;

const run = (over: Partial<RunRecord>): RunRecord =>
  ({
    status: "completed",
    kind: "audit",
    source: { label: "web" },
    groups: [],
    workOrders: [],
    error: null,
    ...over,
  }) as unknown as RunRecord;

describe("resultOf", () => {
  it("counts a code run's issues, most severe first", () => {
    const result = resultOf(
      run({
        groups: [group("a", "low"), group("b", "critical"), group("c", "high")],
        workOrders: [{}, {}] as RunRecord["workOrders"],
      }),
    );
    expect(result.headline).toBe("3 issues found, 1 critical.");
    expect(result.detail).toBe(
      "2 work orders written with acceptance criteria.",
    );
    expect(result.numbers.map((item) => item.value)).toEqual(["1", "1", "2"]);
    expect(result.items.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(result.action).toEqual({ label: "See The Issues", tab: "findings" });
  });

  it("words an idea's run as probable risks", () => {
    const result = resultOf(
      run({ source: undefined, groups: [group("a", "high")] }),
    );
    expect(result.headline).toBe("1 risk found.");
    expect(result.numbers[0].label).toBe("Critical risk");
    expect(result.numbers[2].label).toBe("Proposed work orders");
    expect(result.action?.label).toBe("See The Risks");
  });

  it("names a fly-off's winner and ranks the designs", () => {
    const result = resultOf(
      run({
        kind: "flyoff",
        flyoff: {
          blueprints: [
            { id: "p1", proposer: "Pragmatist", blueprint: { name: "Grants" } },
            { id: "p2", proposer: "Scaler", blueprint: { name: "Shards" } },
          ],
          critiques: [{ weaknesses: [{}, {}] }],
          verdict: {
            winnerId: "p1",
            summary: "Simplest that works.",
            ranking: [
              { blueprintId: "p1", rank: 1, reason: "Least to run" },
              { blueprintId: "p2", rank: 2, reason: "Too much" },
            ],
            nextSteps: [],
          },
        } as unknown as RunRecord["flyoff"],
      }),
    );
    expect(result.headline).toBe("Pragmatist's design wins: Grants.");
    expect(result.numbers.map((item) => item.value)).toEqual(["2", "1", "2"]);
    expect(result.items[0].title).toBe("1. Pragmatist: Grants");
    expect(result.action?.tab).toBe("report");
  });

  it("points a black box at the line and says whether a fix is ready", () => {
    const result = resultOf(
      run({
        kind: "blackbox",
        triage: {
          title: "Unescaped search term",
          severity: "high",
          confidence: "high",
          suspects: [
            { path: "catalog/search.py", startLine: 4, why: "Raw SQL" },
          ],
        } as unknown as RunRecord["triage"],
        remediations: {
          "incident-1": { status: "made", edits: [{}] },
        } as unknown as RunRecord["remediations"],
      }),
    );
    expect(result.headline).toBe("Cause found in catalog/search.py:4.");
    expect(result.numbers.map((item) => item.value)).toEqual([
      "High",
      "High",
      "Ready",
    ]);
    expect(result.action).toEqual({ label: "Review The Fix", tab: "report" });
  });

  it("says what a Crosswind change touches, breaks and fixes", () => {
    const result = resultOf(
      run({
        kind: "crosswind",
        groups: [group("a", "high")],
        impact: {
          components: [{}, {}, {}],
          fixes: [{}],
          summary: "x",
        } as unknown as RunRecord["impact"],
      }),
    );
    expect(result.headline).toBe(
      "This change touches 3 parts and could break 1 thing.",
    );
    expect(result.detail).toBe("It also fixes 1 known issue.");
  });

  it("says a failed run failed, with its error", () => {
    const result = resultOf(run({ status: "failed", error: "No key" }));
    expect(result).toMatchObject({
      headline: "This run failed.",
      detail: "No key",
    });
  });
});
