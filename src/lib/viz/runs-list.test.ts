import { describe, expect, it } from "vitest";

import type { RunSummary } from "@/server/engine/schema";

import { runRow, runsTotals } from "./runs-list";

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  id: "r1",
  projectId: "p1",
  kind: "audit",
  parentRunId: null,
  createdAt: "2026-11-16T10:00:00Z",
  status: "completed",
  stage: null,
  title: "Storefront",
  findingCount: 4,
  workOrderCount: 2,
  workspaces: ["web", "gateway", "catalog", "billing"],
  costUsd: 0.5,
  counts: { critical: 1, high: 1, medium: 2, low: 0 },
  ...over,
});

describe("runRow", () => {
  it("calls a code run that repeats the project's name a code run", () => {
    const row = runRow(run(), "Storefront");
    expect(row.title).toBe("Code run");
    expect(row.tag).toBeNull();
    expect(row.workspaces).toEqual({ shown: ["web", "gateway"], more: 2 });
    expect(row.step).toBeNull();
  });

  it("keeps its own title, and tags requirement and other kinds", () => {
    const idea = runRow(run({ title: "Checkout", workspaces: [] }), "Shop");
    expect(idea).toMatchObject({
      title: "Checkout",
      tag: "Requirement",
      probable: true,
    });
    expect(idea.workspaces).toEqual({ shown: [], more: 0 });
    expect(runRow(run({ kind: "flyoff" })).tag).toBe("Fly-off");
  });

  it("gives the stage of a running run", () => {
    const row = runRow(run({ status: "running", stage: null }));
    expect(row.step).toBe("Starting");
  });
});

describe("runsTotals", () => {
  it("adds up runs, running ones, cost and findings", () => {
    expect(
      runsTotals([
        run(),
        run({ status: "running", costUsd: null, findingCount: 0 }),
        run({ costUsd: 0.254 }),
      ]),
    ).toEqual({ runs: 3, running: 1, spent: 0.75, findings: 8 });
  });
});
