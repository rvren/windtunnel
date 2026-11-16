import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { db, pool } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import {
  agentReports,
  issues,
  projects,
  runEvents,
  runs,
  workspaces,
} from "../db/schema";
import { newRun } from "../engine/run";
import { PgRunStore } from "../engine/store";
import { addWorkspace, createProject, getProject } from "../projects/store";

// Starting a run is recorded, not done: these tests are about the schedule.
const started = vi.hoisted(() => [] as string[]);
vi.mock("../engine/registry", async (original) => ({
  ...(await original<typeof import("../engine/registry")>()),
  startRun: vi.fn(async (input: { project?: { id: string } }) => {
    started.push(input.project?.id ?? "");
    return { id: randomUUID() };
  }),
}));

const { claimDue, setSchedule, spentThisMonth, tick } =
  await import("./scheduler");

beforeAll(async () => {
  await migrateDatabase();
});

beforeEach(async () => {
  started.length = 0;
  await db().delete(issues);
  await db().delete(runEvents);
  await db().delete(agentReports);
  await db().delete(runs);
  await db().delete(workspaces);
  await db().delete(projects);
});

afterAll(async () => {
  await pool().end();
});

async function project(name: string, demo = false) {
  const created = await createProject({ name, description: "A shop.", demo });
  await addWorkspace((await getProject(created.id))!, {
    name: "web",
    origin: { kind: "local", name: "web" },
  });
  return created.id;
}

async function pastRun(projectId: string, costUsd: number, at: Date) {
  const run = newRun(
    randomUUID(),
    {
      requirement: "",
      documents: [],
      project: {
        id: projectId,
        name: "Shop",
        workspaces: [{ name: "web", origin: { kind: "local", name: "web" } }],
      },
    },
    { reasoning: "r", agents: "a" },
    at,
    false,
  );
  await new PgRunStore(db()).save({ ...run, status: "completed", costUsd });
}

describe("scheduled runs", () => {
  it("claims a due project once, and moves its next run on", async () => {
    const id = await project("Shop");
    const now = new Date("2026-11-16T07:00:00");
    await setSchedule(
      id,
      { every: "daily", hour: 6, monthlyCapUsd: null },
      new Date("2026-11-15T07:00:00"),
    );
    // Two processes look at the same moment: only one wins.
    const [first, second] = await Promise.all([claimDue(now), claimDue(now)]);
    expect([...first, ...second]).toEqual([id]);
    const [row] = await db().select().from(projects).where(eq(projects.id, id));
    expect(row.nextRunAt).toEqual(new Date("2026-11-17T06:00:00"));
    expect(await claimDue(now)).toEqual([]);
  });

  it("starts the run, or skips it once the month's cap would be passed", async () => {
    const id = await project("Shop");
    const now = new Date("2026-11-16T07:00:00");
    await pastRun(id, 6, new Date("2026-11-10T07:00:00"));
    await pastRun(id, 3, new Date("2026-11-12T07:00:00"));
    // Last month does not count.
    await pastRun(id, 100, new Date("2026-10-30T07:00:00"));
    expect(await spentThisMonth(id, now)).toBe(9);

    await setSchedule(
      id,
      { every: "daily", hour: 6, monthlyCapUsd: 20 },
      new Date("2026-11-15T07:00:00"),
    );
    await tick(now);
    expect(started).toEqual([id]);

    // 9 spent and the last run cost 3: a cap of 10 is too small.
    await setSchedule(
      id,
      { every: "daily", hour: 6, monthlyCapUsd: 10 },
      new Date("2026-11-15T07:00:00"),
    );
    await tick(now);
    expect(started).toEqual([id]);
    const after = await getProject(id);
    expect(after?.schedule.note).toContain("cap of $10.00");
  });

  it("never runs a project that is off", async () => {
    const id = await project("Quiet");
    await setSchedule(id, { every: "off", hour: 6, monthlyCapUsd: null });
    await tick(new Date("2030-01-01T00:00:00"));
    expect(started).toEqual([]);
  });
});
