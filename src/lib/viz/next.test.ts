import { describe, expect, it } from "vitest";

import type { RunRecord } from "@/server/engine/schema";

import { nextRunsOf, prefillFrom } from "./next";

const run = (over: Partial<RunRecord>): RunRecord =>
  ({
    id: "r1",
    projectId: "p1",
    title: "Invites",
    status: "completed",
    kind: "audit",
    requirement: "",
    groups: [],
    workOrders: [],
    error: null,
    ...over,
  }) as unknown as RunRecord;

const flyoff = run({
  kind: "flyoff",
  requirement: "Let admins invite people.",
  flyoff: {
    blueprints: [
      {
        id: "p1",
        proposer: "Pragmatist",
        angle: "",
        status: "done",
        error: null,
        blueprint: {
          name: "Grants",
          summary: "One table of grants.",
          components: [
            { name: "Invites", kind: "service", description: "Sends invites." },
          ],
          connections: [],
          decisions: [
            { decision: "Store grants", why: "simple", tradeoff: "no history" },
          ],
          risks: [],
        },
      },
    ],
    critiques: [],
    verdict: { winnerId: "p1", summary: "", ranking: [], nextSteps: [] },
  },
});

describe("nextRunsOf", () => {
  it("offers nothing until a run has finished", () => {
    expect(nextRunsOf(run({ status: "running", requirement: "x" }))).toEqual(
      [],
    );
  });

  it("links each next run to the start page, filled in from this run", () => {
    const [next] = nextRunsOf(
      run({ requirement: "Let admins invite people." }),
    );
    expect(next.kind).toBe("flyoff");
    const url = new URL(next.href, "http://x");
    expect(url.pathname).toBe("/app/runs/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      kind: "flyoff",
      from: "r1",
      project: "p1",
    });
  });

  it("tests a fly-off's winner, and never offers more than three", () => {
    expect(nextRunsOf(flyoff).map((item) => item.label)).toEqual([
      "Test The Winning Design",
    ]);
    expect(nextRunsOf(run({ kind: "flyoff" }))).toEqual([]);
  });

  it("follows a black box with a run over the whole project", () => {
    const next = nextRunsOf(
      run({ kind: "blackbox", source: { label: "x" } as RunRecord["source"] }),
    );
    expect(next[0].href).toContain("subject=code");
  });
});

describe("prefillFrom", () => {
  it("turns the winning blueprint into the requirement to test", () => {
    const prefill = prefillFrom(flyoff, "audit", "requirement");
    expect(prefill.subject).toBe("requirement");
    expect(prefill.text).toContain("Let admins invite people.");
    expect(prefill.text).toContain("## Chosen design: Grants");
    expect(prefill.text).toContain("- Invites (service): Sends invites.");
  });

  it("fills in only what the earlier run holds", () => {
    expect(prefillFrom(run({}), "flyoff", undefined)).toEqual({});
    expect(prefillFrom(run({}), "audit", "elsewhere")).toEqual({});
  });
});
