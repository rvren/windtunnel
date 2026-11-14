import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import { agentReports, projects, runEvents, runs } from "../db/schema";
import { newRun } from "../engine/run";
import { PgRunStore } from "../engine/store";
import {
  addWorkspace,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  parseProject,
  parseWorkspace,
  removeWorkspace,
} from "./store";

// Runs against the windtunnel_test database. See vitest.db.config.mts.

beforeAll(async () => {
  await migrateDatabase();
});

beforeEach(async () => {
  await db().delete(runEvents);
  await db().delete(agentReports);
  await db().delete(runs);
  await db().delete(projects);
});

afterAll(async () => {
  await pool().end();
});

const local = (name: string) => ({ kind: "local" as const, name });

describe("checking what a person sends", () => {
  it("needs a name for a project", () => {
    expect(parseProject({ name: "  " }).ok).toBe(false);
    expect(parseProject({ name: " Storefront " })).toEqual({
      ok: true,
      value: { name: "Storefront", description: "" },
    });
  });

  it("keeps workspace names safe to use as a folder name", () => {
    for (const name of ["Web", "a/b", "..", "", "-x"]) {
      expect(parseWorkspace({ name, origin: local("web") }).ok).toBe(false);
    }
    expect(
      parseWorkspace({ name: "billing-api", origin: local("web") }).ok,
    ).toBe(true);
    expect(parseWorkspace({ name: "web", origin: local("../etc") }).ok).toBe(
      false,
    );
  });
});

describe("projects in Postgres", () => {
  it("saves a project with its workspaces and reads them back in order", async () => {
    const project = await createProject({
      name: "Storefront",
      description: "A shop.",
    });
    expect(
      (await addWorkspace(project, { name: "web", origin: local("web") })).ok,
    ).toBe(true);
    const again = (await getProject(project.id))!;
    const added = await addWorkspace(again, {
      name: "api",
      origin: {
        kind: "github",
        url: "https://github.com/acme/api",
        branch: null,
      },
    });
    expect(added.ok).toBe(true);

    const read = (await getProject(project.id))!;
    expect(read.name).toBe("Storefront");
    expect(read.workspaces.map((item) => [item.name, item.label])).toEqual([
      ["web", "web"],
      ["api", "acme/api"],
    ]);
    expect(
      (await listProjects()).map((item) => item.workspaces.length),
    ).toEqual([2]);
  });

  it("refuses a second workspace with the same name", async () => {
    const project = await createProject({
      name: "Storefront",
      description: "",
    });
    await addWorkspace(project, { name: "web", origin: local("web") });
    const again = (await getProject(project.id))!;
    const second = await addWorkspace(again, {
      name: "web",
      origin: local("other"),
    });
    expect(second.ok).toBe(false);
  });

  it("removes a workspace", async () => {
    const project = await createProject({
      name: "Storefront",
      description: "",
    });
    const added = await addWorkspace(project, {
      name: "web",
      origin: local("web"),
    });
    if (!added.ok) throw new Error(added.error);
    await removeWorkspace(added.value.id);
    expect((await getProject(project.id))!.workspaces).toEqual([]);
  });

  it("keeps a project's runs when the project is deleted, unlinked", async () => {
    const project = await createProject({
      name: "Storefront",
      description: "",
    });
    await addWorkspace(project, { name: "web", origin: local("web") });
    const store = new PgRunStore(db());
    const run = newRun(
      "00000000-0000-4000-8000-000000000021",
      {
        requirement: "",
        documents: [],
        project: {
          id: project.id,
          name: project.name,
          workspaces: [{ name: "web", origin: local("web") }],
        },
      },
      { reasoning: "reasoning-model", agents: "agent-model" },
      new Date("2026-11-13T10:00:00Z"),
      true,
    );
    await store.save(run);
    expect((await store.list(project.id)).map((item) => item.id)).toEqual([
      run.id,
    ]);
    expect(await store.list("00000000-0000-4000-8000-000000000099")).toEqual(
      [],
    );

    await deleteProject(project.id);
    expect(await getProject(project.id)).toBeNull();
    const [kept] = await store.list();
    expect(kept).toMatchObject({ id: run.id, projectId: null });
  });
});
