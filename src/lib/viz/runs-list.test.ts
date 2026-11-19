import { describe, expect, it } from "vitest";

import type { RunSummary } from "@/server/engine/schema";

import { kindCounts, runRow, runsTotals } from "./runs-list";

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
  it("names every run's kind, a Tunnel Run with what it ran on", () => {
    const row = runRow(run(), "Storefront");
    expect(row.title).toBe("Code run");
    expect(row.kind).toEqual({
      id: "audit",
      label: "Tunnel Run",
      detail: "Code",
    });
    expect(row.workspaces).toEqual({ shown: ["web", "gateway"], more: 2 });
    expect(row.step).toBeNull();
    expect(row.result).toBe("findings");
  });

  it("keeps the title without the kind in front of it", () => {
    const idea = runRow(run({ title: "Checkout", workspaces: [] }), "Shop");
    expect(idea).toMatchObject({
      title: "Checkout",
      kind: { label: "Tunnel Run", detail: "An idea" },
      probable: true,
    });
    expect(idea.workspaces).toEqual({ shown: [], more: 0 });
    const out = runRow(
      run({ kind: "engineout", title: "Engine out: Billing service down" }),
    );
    expect(out.title).toBe("Billing service down");
    expect(out.kind).toEqual({
      id: "engineout",
      label: "Engine Out",
      detail: null,
    });
  });

  it("keeps another kind's title even when it is the project's name", () => {
    expect(runRow(run({ kind: "preflight" }), "Storefront").title).toBe(
      "Storefront",
    );
  });

  it("reads a Dogfight's and a Fly-off's result as what they are", () => {
    expect(runRow(run({ kind: "dogfight" })).result).toBe("defended");
    expect(runRow(run({ kind: "flyoff" })).result).toBe("picked");
  });

  it("gives the stage of a running run", () => {
    const row = runRow(run({ status: "running", stage: null }));
    expect(row.step).toBe("Starting");
  });
});

describe("kindCounts", () => {
  it("counts the kinds present, in the launcher's order", () => {
    expect(
      kindCounts([
        run({ kind: "dogfight" }),
        run(),
        run({ kind: "dogfight" }),
        run({ kind: "engineout" }),
      ]),
    ).toEqual([
      { kind: "audit", label: "Tunnel Run", count: 1 },
      { kind: "engineout", label: "Engine Out", count: 1 },
      { kind: "dogfight", label: "Dogfight", count: 2 },
    ]);
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
