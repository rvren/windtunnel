import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import { agentReports, projects, runEvents, runs } from "../db/schema";
import { newRun } from "../engine/run";
import { PgRunStore } from "../engine/store";
import { ADOPTED, adoptLooseRuns } from "./adopt";
import { hasDemoData, removeDemoData } from "./demo";
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

describe("runs by workspace, and demo data", () => {
  const store = new PgRunStore(db());
  const runOf = (n: number, projectId: string, names: string[]) =>
    newRun(
      `00000000-0000-4000-8000-00000000003${n}`,
      {
        requirement: "",
        documents: [],
        project: {
          id: projectId,
          name: "Storefront",
          workspaces: names.map((name) => ({ name, origin: local(name) })),
        },
      },
      { reasoning: "reasoning-model", agents: "agent-model" },
      new Date(`2026-11-13T10:0${n}:00Z`),
      true,
    );

  it("finds a run by any workspace it read, and not by one it did not", async () => {
    const project = await createProject({
      name: "Storefront",
      description: "",
    });
    await store.save(runOf(1, project.id, ["web", "orders"]));
    await store.save(runOf(2, project.id, ["web"]));
    const ids = async (workspaces: string[]) =>
      (await store.list({ projectId: project.id, workspaces })).map((run) =>
        run.id.slice(-1),
      );
    expect(await ids([])).toEqual(["2", "1"]);
    expect(await ids(["web"])).toEqual(["2", "1"]);
    expect(await ids(["orders"])).toEqual(["1"]);
    expect(await ids(["web", "orders"])).toEqual(["1"]);
    expect(await ids(["billing"])).toEqual([]);
    expect((await store.list())[1].workspaces).toEqual(["web", "orders"]);
  });

  it("gathers runs that have no project under Demo project, once", async () => {
    const loose = newRun(
      "00000000-0000-4000-8000-000000000041",
      {
        requirement: "",
        documents: [],
        repository: {
          kind: "github",
          url: "https://github.com/acme/shop",
          branch: null,
        },
      },
      { reasoning: "reasoning-model", agents: "agent-model" },
      new Date("2026-11-13T09:00:00Z"),
      false,
    );
    await store.save(loose);
    const real = await createProject({ name: "Real", description: "" });
    await store.save(runOf(1, real.id, ["web"]));

    expect(await adoptLooseRuns()).toBe(1);
    expect(await adoptLooseRuns()).toBe(0);
    const adopted = (await listProjects()).find(
      (item) => item.name === ADOPTED.project,
    )!;
    expect(adopted.demo).toBe(false);
    expect(adopted.workspaces.map((item) => [item.name, item.label])).toEqual([
      ["demo", "acme/shop"],
    ]);
    expect(
      (await store.list({ projectId: adopted.id })).map((run) => run.id),
    ).toEqual([loose.id]);
    expect(await store.get(loose.id)).toMatchObject({
      projectId: adopted.id,
      workspaces: ["demo"],
    });
    // A run that had a project keeps it, and sample data never includes these.
    expect((await store.list({ projectId: real.id })).length).toBe(1);
    expect(await removeDemoData()).toEqual({ projects: 0, runs: 0 });
  });

  it("removes demo projects and their runs, and nothing else", async () => {
    const real = await createProject({ name: "Real", description: "" });
    const demo = await createProject({
      name: "Storefront",
      description: "",
      demo: true,
    });
    await addWorkspace(demo, { name: "web", origin: local("web") });
    await store.save(runOf(1, real.id, ["web"]));
    const demoRun = runOf(2, demo.id, ["web"]);
    await store.save(demoRun);
    await store.appendEvent(demoRun.id, {
      seq: 1,
      at: "2026-11-13T10:02:00Z",
      event: { type: "run.started" },
    });

    expect(await hasDemoData()).toBe(true);
    expect(await removeDemoData()).toEqual({ projects: 1, runs: 1 });
    expect(await hasDemoData()).toBe(false);
    expect((await listProjects()).map((item) => item.name)).toEqual(["Real"]);
    expect((await store.list()).map((run) => run.projectId)).toEqual([real.id]);
    expect(await store.events(demoRun.id)).toEqual([]);
    expect(await removeDemoData()).toEqual({ projects: 0, runs: 0 });
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
    expect(
      (await store.list({ projectId: project.id })).map((item) => item.id),
    ).toEqual([run.id]);
    expect(
      await store.list({
        projectId: "00000000-0000-4000-8000-000000000099",
      }),
    ).toEqual([]);

    await deleteProject(project.id);
    expect(await getProject(project.id)).toBeNull();
    const [kept] = await store.list();
    expect(kept).toMatchObject({ id: run.id, projectId: null });
  });
});
