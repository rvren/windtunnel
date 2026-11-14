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
  origin: "code",
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
});

describe("the home page's numbers", () => {
  it("gives each project its share fixed and its next action", () => {
    const shop = numbers.projects.find((p) => p.id === "p1")!;
    // 2 fixed of 2 fixed + 3 live.
    expect(shop.fixedShare).toBeCloseTo(2 / 5);
    expect(shop.merged).toBe(1);
    expect(shop.next.kind).toBe("rescan");
    const billing = numbers.projects.find((p) => p.id === "p2")!;
    // A reopened high security issue with no PR comes next.
    expect(billing.next).toMatchObject({ kind: "fix" });
    expect(billing.bySeverity.high).toBe(1);
  });

  it("sums up each project with its last run", () => {
    const shop = numbers.projects.find((p) => p.id === "p1")!;
    expect(shop).toMatchObject({ prs: 1, open: 3 });
    expect(shop.bySeverity).toMatchObject({ critical: 1, high: 1 });
    expect(shop.lastRun?.id).toBe("r2");
    expect(numbers.projects.find((p) => p.id === "p2")!.lastRun).toBeNull();
  });
});
