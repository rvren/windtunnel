import { eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { projects, runs } from "../db/schema";
import { runStore, startRun } from "../engine/registry";
import { SAMPLE_SERVICES, sampleRepoUrl } from "../engine/sample-project";
import { addWorkspace, createProject } from "./store";

/*
 * Demo data: the Storefront sample application as a project. A demo
 * project's runs replay a script and never call the model, but everything
 * else is real: its workspaces are the private repositories
 * rvren/storefront-<service>, fetched from GitHub like any other.
 */

export const DEMO_PROJECT = {
  name: "Storefront",
  description:
    "An online shop. Buyers sign in, search the catalog and check out; orders are charged through billing and confirmed by email.",
} as const;

/** The sample repositories, for the workspace form of a demo project. */
export const DEMO_REPOSITORIES = SAMPLE_SERVICES.map((service) => ({
  name: service,
  url: sampleRepoUrl(service),
}));

/**
 * Adds the demo project. Empty, it is ready for its repositories to be
 * added one by one. Complete, it has all seven and one scripted run started.
 */
export async function addDemoProject(
  complete: boolean,
): Promise<{ projectId: string; runId: string | null }> {
  const project = await createProject({ ...DEMO_PROJECT, demo: true });
  if (!complete) return { projectId: project.id, runId: null };

  let current = project;
  for (const { name, url } of DEMO_REPOSITORIES) {
    const added = await addWorkspace(current, {
      name,
      origin: { kind: "github", url, branch: null },
    });
    if (!added.ok) throw new Error(added.error);
    current = { ...current, workspaces: [...current.workspaces, added.value] };
  }
  const run = await startRun({
    requirement: project.description,
    documents: [],
    project: {
      id: project.id,
      name: project.name,
      demo: true,
      workspaces: current.workspaces.map(({ name, origin }) => ({
        name,
        origin,
      })),
    },
  });
  return { projectId: project.id, runId: run.id };
}

/**
 * Removes every demo project with its workspaces and its runs. Projects and
 * runs that are not demo data are not touched.
 */
export async function removeDemoData(): Promise<{
  projects: number;
  runs: number;
}> {
  const demo = await db()
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.demo, true));
  const ids = demo.map((row) => row.id);
  if (ids.length === 0) return { projects: 0, runs: 0 };
  const theirs = await db()
    .select({ id: runs.id })
    .from(runs)
    .where(inArray(runs.projectId, ids));
  await runStore().remove(theirs.map((row) => row.id));
  await db().delete(projects).where(inArray(projects.id, ids));
  return { projects: ids.length, runs: theirs.length };
}

/** Is there demo data to remove? */
export async function hasDemoData(): Promise<boolean> {
  const [row] = await db()
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.demo, true))
    .limit(1);
  return Boolean(row);
}
