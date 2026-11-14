import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { applyEvent, emptyFeed, type Feed } from "@/lib/run-feed";
import { executeRun, newRun } from "@/server/engine/run";
import { ScriptedLlm } from "@/server/engine/sample";
import {
  SAMPLE_SERVICES,
  sampleProjectScript,
  sampleServiceOf,
} from "@/server/engine/sample-project";
import type { RunRecord, StoredEvent } from "@/server/engine/schema";
import { MemoryRunStore } from "@/server/engine/store";

import { currentChapter, storyOf } from "./story";
import { timesFrom } from "./times";

const SAMPLES = path.resolve(
  import.meta.dirname,
  "../../../samples/storefront",
);

let run: RunRecord;
let events: StoredEvent[];
beforeAll(async () => {
  process.env.WINDTUNNEL_REPOS_DIR = SAMPLES;
  const workspaces = SAMPLE_SERVICES.map((name) => ({
    name,
    origin: { kind: "local" as const, name },
  }));
  events = [];
  let seq = 0;
  run = await executeRun(
    {
      llm: new ScriptedLlm(
        sampleProjectScript(
          workspaces.map((item) => ({
            name: item.name,
            service: sampleServiceOf(item.origin),
          })),
        ),
      ),
      store: new MemoryRunStore(),
      publish: (_id, stored) => events.push({ ...stored, seq: seq++ }),
      now: () => new Date("2026-11-13T10:00:05Z"),
    },
    newRun(
      "run-story",
      {
        requirement: "",
        documents: [],
        project: { id: "p", name: "Storefront", workspaces, demo: true },
      },
      { reasoning: "r", agents: "a" },
      new Date("2026-11-13T10:00:00Z"),
      true,
    ),
  );
});

const feedOf = (list: StoredEvent[]): Feed =>
  list.reduce((feed, stored) => applyEvent(feed, stored.event), emptyFeed());

describe("the run as a story", () => {
  it("has one chapter per stage of a code run, in order, all done", () => {
    const chapters = storyOf(run, feedOf(events), timesFrom(events));
    expect(chapters.map((c) => c.stage)).toEqual([
      "survey",
      "model",
      "coverage",
      "agents",
      "challenge",
      "judge",
      "remediation",
      "work_orders",
    ]);
    expect(chapters.every((c) => c.state === "done")).toBe(true);
    expect(currentChapter(chapters)).toBeNull();
  });

  it("tells what each stage found, from the run itself", () => {
    const chapters = storyOf(run, feedOf(events), timesFrom(events));
    const result = (stage: string) =>
      chapters.find((c) => c.stage === stage)!.result!;
    const model = result("model");
    expect(model.kind === "model" && model.counts[0].value).toBe(
      run.designModel!.roles.length,
    );
    const coverage = result("coverage");
    expect(coverage.kind === "coverage" && coverage.total).toBe(
      run.coverage!.gaps.length,
    );
    if (coverage.kind === "coverage") {
      expect(coverage.byKind.reduce((s, k) => s + k.value, 0)).toBe(
        coverage.total,
      );
    }
    const agents = result("agents");
    expect(agents.kind === "agents" && agents.total).toBe(
      run.agents.reduce((s, a) => s + a.findings.length, 0),
    );
    const judge = result("judge");
    if (judge.kind === "judge") {
      expect(judge.accepted).toBe(run.groups.length);
      expect(Object.values(judge.bySeverity).reduce((a, b) => a + b, 0)).toBe(
        run.groups.length,
      );
      expect(judge.top.length).toBeLessThanOrEqual(3);
    }
    const orders = result("work_orders");
    expect(orders.kind === "work_orders" && orders.total).toBe(
      run.workOrders.length,
    );
  });

  it("shows a stage as running, with no result, half-way through", () => {
    const upTo = events.findIndex(
      (stored) =>
        stored.event.type === "stage.started" && stored.event.stage === "judge",
    );
    const partial = events.slice(0, upTo + 1);
    const live = { ...run, status: "running" as const };
    const chapters = storyOf(live, feedOf(partial), timesFrom(partial));
    const judge = chapters.find((c) => c.stage === "judge")!;
    expect(judge.state).toBe("running");
    expect(judge.result).toBeNull();
    expect(currentChapter(chapters)?.stage).toBe("judge");
    expect(chapters.find((c) => c.stage === "work_orders")!.state).toBe(
      "pending",
    );
  });

  it("stops at the stage that failed, with its error", () => {
    const failed = {
      ...run,
      status: "failed" as const,
      stage: "agents" as const,
      error: "The model refused.",
    };
    const chapters = storyOf(failed, emptyFeed(), timesFrom([]));
    const agents = chapters.find((c) => c.stage === "agents")!;
    expect(agents.state).toBe("failed");
    expect(agents.line).toBe("The model refused.");
    expect(currentChapter(chapters)?.stage).toBe("agents");
  });
});
