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

import { db, pool } from "@/server/db/client";
import { migrateDatabase } from "@/server/db/migrate";
import {
  agentReports,
  issues,
  projects,
  runEvents,
  runs,
} from "@/server/db/schema";
import { newRun } from "@/server/engine/run";
import { PgRunStore } from "@/server/engine/store";
import { createProject } from "@/server/projects/store";

// Starting a run is mocked: these tests are about what the API accepts.
const started = vi.hoisted(() => [] as unknown[]);
vi.mock("@/server/engine/registry", async (original) => ({
  ...(await original<typeof import("@/server/engine/registry")>()),
  startRun: vi.fn(async (input: unknown) => {
    started.push(input);
    return { id: "new-run" };
  }),
}));

const { POST } = await import("./route");

beforeAll(async () => {
  await migrateDatabase();
});

beforeEach(async () => {
  started.length = 0;
  await db().delete(issues);
  await db().delete(runEvents);
  await db().delete(agentReports);
  await db().delete(runs);
  await db().delete(projects);
});

afterAll(async () => {
  await pool().end();
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

async function requirementRun(projectId: string, code = false) {
  const run = newRun(
    randomUUID(),
    {
      requirement: "A shop.",
      documents: [],
      projectRef: { id: projectId, demo: true },
    },
    { reasoning: "r", agents: "a" },
    new Date(),
    true,
  );
  await new PgRunStore(db()).save({
    ...run,
    status: "completed",
    ...(code
      ? {
          workspaces: ["web"],
          source: {
            kind: "repository" as const,
            origin: { kind: "local" as const, name: "web" },
            label: "web",
            files: 1,
            languages: [],
          },
        }
      : {}),
  });
  return run.id;
}

describe("starting the next version of a requirement", () => {
  it("links the new run to the version it refines", async () => {
    const project = await createProject({ name: "Shop", description: "" });
    const parent = await requirementRun(project.id);
    const response = await post({
      projectId: project.id,
      requirement: "A shop.\n\n## Decisions\n\n- Refunds within 14 days.",
      documents: [],
      parentRunId: parent,
    });
    expect(response.status).toBe(201);
    expect(started[0]).toMatchObject({ parentRunId: parent });
  });

  it("refuses a parent that is not a requirement run of this project", async () => {
    const shop = await createProject({ name: "Shop", description: "" });
    const other = await createProject({ name: "Other", description: "" });
    const elsewhere = await requirementRun(other.id);
    const code = await requirementRun(shop.id, true);
    for (const parentRunId of [elsewhere, code, randomUUID()]) {
      const response = await post({
        projectId: shop.id,
        requirement: "A shop.",
        documents: [],
        parentRunId,
      });
      expect(response.status).toBe(400);
    }
    expect(
      (
        await post({
          projectId: shop.id,
          requirement: "A shop.",
          documents: [],
          parentRunId: "not-a-run",
        })
      ).status,
    ).toBe(400);
    expect(started).toEqual([]);
  });
});
