import { describe, expect, it } from "vitest";

import type { RunSummary } from "@/server/engine/schema";
import type { Issue } from "@/server/issues/store";

import { homeNumbers } from "./home";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86400000).toISOString();

const issue = (over: Partial<Issue> & { id: string }): Issue => ({
  projectId: "p1",
  title: "t",
  kind: "security_vulnerability",
  severity: "high",
  state: "open",
  path: null,
  cwe: null,
  firstRunId: null,
  lastRunId: null,
  lastGroupId: null,
  verifiedRunId: null,
  pr: null,
  openedAt: day(10),
  updatedAt: day(1),
  fixedAt: null,
  ...over,
});

const pr = (number: number) => ({
  repo: "me/web",
  number,
  url: `https://github.com/me/web/pull/${number}`,
  branch: "b",
  state: "open" as const,
  mergedAt: null,
});

const issues: Issue[] = [
  issue({ id: "a", severity: "critical", openedAt: day(20) }),
  issue({ id: "b", severity: "high", state: "pr_open", pr: pr(3) }),
  issue({
    id: "c",
    severity: "medium",
    state: "merged",
    pr: { ...pr(4), state: "merged" },
  }),
  issue({
    id: "d",
    severity: "low",
    state: "fixed",
    openedAt: day(9),
    fixedAt: day(5),
  }),
  issue({
    id: "e",
    severity: "high",
    state: "fixed",
    openedAt: day(8),
    fixedAt: day(2),
  }),
  issue({ id: "f", severity: "critical", state: "gone" }),
  issue({
    id: "g",
    projectId: "p2",
    severity: "high",
    state: "reopened",
    openedAt: day(3),
  }),
];

const runs = [
  { id: "r1", projectId: "p1", createdAt: day(2), status: "completed" },
  { id: "r2", projectId: "p1", createdAt: day(1), status: "completed" },
] as RunSummary[];

const numbers = homeNumbers({
  projects: [
    { id: "p1", name: "Shop" },
    { id: "p2", name: "Billing" },
  ],
  issues,
  runs,
  now: NOW,
});

describe("the home page's numbers", () => {
  it("lists what needs a person", () => {
    expect(numbers.needs.awaitingRescan).toEqual([
      { projectId: "p1", name: "Shop", count: 1 },
    ]);
    expect(numbers.needs.prsOpen.map((i) => i.id)).toEqual(["b"]);
    // Critical first, then oldest; issues with a PR or gone are left out.
    expect(numbers.needs.unfixedSerious.map((i) => i.id)).toEqual(["a", "g"]);
  });

  it("counts live issues by severity and the pipeline", () => {
    expect(numbers.open.total).toBe(4);
    expect(numbers.open.bySeverity).toEqual({
      critical: 1,
      high: 2,
      medium: 1,
      low: 0,
    });
    expect(numbers.pipeline).toEqual({
      open: 2,
      prOpen: 1,
      merged: 1,
      fixed: 2,
    });
  });

  it("measures time to fix and the oldest open critical issue", () => {
    expect(numbers.timeToFix.medianDays).toBe(5);
    expect(numbers.timeToFix.fixed).toBe(2);
    expect(numbers.timeToFix.oldestCritical?.id).toBe("a");
    expect(Math.round(numbers.timeToFix.oldestCritical!.days)).toBe(20);
  });

  it("counts opened and fixed per week over eight weeks", () => {
    expect(numbers.open.weeks).toHaveLength(8);
    const last = numbers.open.weeks.at(-1)!;
    expect(last.fixed).toBe(2);
    expect(numbers.open.weeks.reduce((s, w) => s + w.opened, 0)).toBe(
      issues.length,
    );
  });

  it("sums up each project with its last run", () => {
    const shop = numbers.projects.find((p) => p.id === "p1")!;
    expect(shop).toMatchObject({ critical: 1, high: 1, prs: 1, open: 3 });
    expect(shop.lastRun?.id).toBe("r2");
    expect(numbers.projects.find((p) => p.id === "p2")!.lastRun).toBeNull();
  });

  it("has no median when nothing was fixed", () => {
    const none = homeNumbers({ projects: [], issues: [], runs: [], now: NOW });
    expect(none.timeToFix.medianDays).toBeNull();
    expect(none.timeToFix.oldestCritical).toBeNull();
  });
});
