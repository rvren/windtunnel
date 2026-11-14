import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import { agentReports, runEvents, runs } from "../db/schema";
import { executeRun, newRun } from "./run";
import { SAMPLE_SCRIPT, ScriptedLlm } from "./sample";
import { PgRunStore } from "./store";

// Runs against the windtunnel_test database. See vitest.db.config.mts.
const store = new PgRunStore(db());
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const sampleRun = (n: number, at: string) =>
  newRun(
    id(n),
    { requirement: `Requirement ${n}`, documents: [] },
    { reasoning: "reasoning-model", agents: "agent-model" },
    new Date(at),
    true,
  );

beforeAll(async () => {
  await migrateDatabase();
});

beforeEach(async () => {
  await db().delete(runEvents);
  await db().delete(agentReports);
  await db().delete(runs);
});

afterAll(async () => {
  await pool().end();
});

describe("PgRunStore", () => {
  it("returns nothing for a run that does not exist", async () => {
    expect(await store.get(id(9))).toBeNull();
    expect(await store.events(id(9))).toEqual([]);
  });

  it("saves a whole run through the engine and reads it back unchanged", async () => {
    const run = sampleRun(1, "2026-11-13T10:00:00Z");
    const done = await executeRun(
      {
        llm: new ScriptedLlm(SAMPLE_SCRIPT),
        store,
        publish: () => {},
        now: () => new Date("2026-11-13T10:00:05Z"),
      },
      run,
    );
    expect(done.status).toBe("completed");

    const saved = await store.get(id(1));
    expect(saved).toEqual(done);
    expect(saved?.agents.map((agent) => agent.agentId)).toEqual([
      "normal_user",
      "adversarial_user",
      "chaos",
      "scale",
      "product_critic",
    ]);

    const events = await store.events(id(1));
    expect(events.map((item) => item.seq)).toEqual(
      events.map((_, index) => index + 1),
    );
    expect(events.at(-1)?.event).toEqual({ type: "run.completed" });
    // Only what a reconnecting page has not seen yet.
    expect(await store.events(id(1), events.length - 2)).toHaveLength(2);
  });

  it("lists runs newest first with their counts", async () => {
    const older = sampleRun(1, "2026-11-13T09:00:00Z");
    const newer = sampleRun(2, "2026-11-13T11:00:00Z");
    newer.status = "completed";
    newer.groups = [
      {
        id: "g1",
        title: "A flaw",
        type: "missing_requirement",
        severity: "high",
        summary: "",
        findingIds: [],
        reviewed: true,
      },
    ];
    await store.save(older);
    await store.save(newer);

    expect(await store.list()).toEqual([
      {
        id: id(2),
        projectId: null,
        workspaces: [],
        createdAt: "2026-11-13T11:00:00.000Z",
        status: "completed",
        stage: null,
        title: "Requirement 2",
        findingCount: 1,
        workOrderCount: 0,
      },
      {
        id: id(1),
        projectId: null,
        workspaces: [],
        createdAt: "2026-11-13T09:00:00.000Z",
        status: "running",
        stage: null,
        title: "Requirement 1",
        findingCount: 0,
        workOrderCount: 0,
      },
    ]);
  });

  it("replaces a run when it is saved again", async () => {
    const run = sampleRun(1, "2026-11-13T10:00:00Z");
    await store.save(run);
    run.status = "failed";
    run.error = "It broke.";
    run.agents[0].status = "failed";
    await store.save(run);

    const saved = await store.get(id(1));
    expect(saved).toMatchObject({ status: "failed", error: "It broke." });
    expect(saved?.agents[0].status).toBe("failed");
    expect(await store.list()).toHaveLength(1);
  });

  it("marks runs cut off by a restart, except the ones still going", async () => {
    await store.save(sampleRun(1, "2026-11-13T10:00:00Z"));
    await store.save(sampleRun(2, "2026-11-13T10:00:00Z"));
    const finished = sampleRun(3, "2026-11-13T10:00:00Z");
    finished.status = "completed";
    await store.save(finished);

    expect(await store.markInterrupted([id(2)])).toBe(1);
    expect(await store.get(id(1))).toMatchObject({
      status: "interrupted",
      error: expect.stringMatching(/server stopped/),
    });
    expect((await store.get(id(2)))?.status).toBe("running");
    expect((await store.get(id(3)))?.status).toBe("completed");
  });
});
