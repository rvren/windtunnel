import { randomUUID } from "node:crypto";

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
import { agentReports, issues, projects, runEvents, runs } from "../db/schema";
import { newRun } from "../engine/run";
import { PgRunStore } from "../engine/store";
import { createProject, getProject } from "../projects/store";

// Which runs count as still going is decided per test.
const live = vi.hoisted(() => new Set<string>());
vi.mock("../engine/registry", async (original) => ({
  ...(await original<typeof import("../engine/registry")>()),
  isActive: (id: string) => live.has(id),
}));

const { deleteProjectAndRuns, deleteRuns } = await import("./delete");

beforeAll(async () => {
  await migrateDatabase();
});

beforeEach(async () => {
  live.clear();
  await db().delete(issues);
  await db().delete(runEvents);
  await db().delete(agentReports);
  await db().delete(runs);
  await db().delete(projects);
});

afterAll(async () => {
  await pool().end();
});

const store = new PgRunStore(db());

async function saved(projectId: string | null, parentRunId?: string) {
  const run = newRun(
    randomUUID(),
    {
      requirement: "A shop.",
      documents: [],
      ...(projectId ? { projectRef: { id: projectId, demo: true } } : {}),
      ...(parentRunId ? { parentRunId } : {}),
    },
    { reasoning: "r", agents: "a" },
    new Date(),
    true,
  );
  await store.save({ ...run, status: "completed" });
  return run.id;
}

describe("deleting runs", () => {
  it("deletes one run or several, and leaves later versions unlinked", async () => {
    const project = await createProject({ name: "Shop", description: "" });
    const first = await saved(project.id);
    const second = await saved(project.id, first);
    const other = await saved(project.id);

    expect(await deleteRuns([first])).toEqual({ ok: true, runs: 1 });
    expect(await store.get(first)).toBeNull();
    expect((await store.get(second))?.parentRunId).toBeUndefined();

    expect(await deleteRuns([second, other, other])).toEqual({
      ok: true,
      runs: 2,
    });
    expect(await store.list({ projectId: project.id })).toEqual([]);
  });

  it("deletes nothing while one of them is still in progress", async () => {
    const a = await saved(null);
    const b = await saved(null);
    live.add(b);
    const result = await deleteRuns([a, b]);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(await store.get(a)).not.toBeNull();
  });
});

describe("deleting a project", () => {
  it("keeps its runs unless asked to delete them too", async () => {
    const kept = await createProject({ name: "Kept", description: "" });
    const run = await saved(kept.id);
    expect(await deleteProjectAndRuns(kept.id, false)).toEqual({
      ok: true,
      runs: 0,
    });
    expect(await getProject(kept.id)).toBeNull();
    expect((await store.get(run))?.projectId).toBeUndefined();

    const gone = await createProject({ name: "Gone", description: "" });
    const one = await saved(gone.id);
    const two = await saved(gone.id);
    expect(await deleteProjectAndRuns(gone.id, true)).toEqual({
      ok: true,
      runs: 2,
    });
    expect(await getProject(gone.id)).toBeNull();
    expect(await store.get(one)).toBeNull();
    expect(await store.get(two)).toBeNull();
  });

  it("keeps the project when one of its runs is still in progress", async () => {
    const project = await createProject({ name: "Busy", description: "" });
    live.add(await saved(project.id));
    const result = await deleteProjectAndRuns(project.id, true);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(await getProject(project.id)).not.toBeNull();
  });
});
