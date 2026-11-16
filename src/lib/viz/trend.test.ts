import { describe, expect, it } from "vitest";

import type { RunSummary } from "@/server/engine/schema";

import { trendPoint, trendRuns, trendScale } from "./trend";

const run = (id: string, over: Partial<RunSummary> = {}): RunSummary =>
  ({
    id,
    projectId: "p",
    parentRunId: null,
    kind: "audit",
    costUsd: null,
    counts: null,
    createdAt: `2026-11-${id.padStart(2, "0")}T10:00:00.000Z`,
    status: "completed",
    stage: null,
    title: "t",
    findingCount: 0,
    workOrderCount: 0,
    workspaces: ["web"],
    ...over,
  }) as RunSummary;

describe("trendRuns", () => {
  it("keeps finished code audits, oldest first", () => {
    const runs = [
      run("5"),
      run("4", { kind: "crosswind" }),
      run("3", { status: "failed" }),
      run("2", { workspaces: [] }),
      run("1"),
    ];
    expect(trendRuns(runs, true).map((item) => item.id)).toEqual(["1", "5"]);
    expect(trendRuns(runs, false).map((item) => item.id)).toEqual(["2"]);
  });

  it("keeps only the latest runs", () => {
    const runs = ["9", "8", "7", "6"].map((id) => run(id));
    expect(trendRuns(runs, true, 2).map((item) => item.id)).toEqual(["8", "9"]);
  });
});

describe("trendPoint", () => {
  it("adds up the severities", () => {
    expect(
      trendPoint(run("1"), { critical: 1, high: 2, medium: 3, low: 4 }).total,
    ).toBe(10);
  });
});

describe("trendScale", () => {
  it("rounds the top up to a step", () => {
    expect(trendScale(0)).toEqual({ top: 4, ticks: [0, 2, 4] });
    expect(trendScale(7)).toEqual({ top: 10, ticks: [0, 5, 10] });
    expect(trendScale(23)).toEqual({ top: 30, ticks: [0, 10, 20, 30] });
    expect(trendScale(140).top).toBeGreaterThanOrEqual(140);
  });
});
