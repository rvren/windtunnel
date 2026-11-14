import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "../db/client";
import { projects, runs, workspaces } from "../db/schema";
import type { RunRecord } from "../engine/schema";

/*
 * Every run belongs to a project. Runs made before that rule belong to
 * none, so at start they are gathered under one project, "Demo project",
 * in its one workspace, "demo". Runs once per start and does nothing when
 * no such run is left.
 */

export const ADOPTED = { project: "Demo project", workspace: "demo" } as const;

export async function adoptLooseRuns(): Promise<number> {
  const loose = await db()
    .select({ id: runs.id, data: runs.data })
    .from(runs)
    .where(isNull(runs.projectId))
    .orderBy(asc(runs.createdAt));
  if (loose.length === 0) return 0;

  return db().transaction(async (tx) => {
    let [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.name, ADOPTED.project), eq(projects.demo, false)))
      .limit(1);
    if (!project) {
      project = { id: randomUUID() };
      await tx.insert(projects).values({
        id: project.id,
        name: ADOPTED.project,
        description: "Runs made before every run belonged to a project.",
        createdAt: new Date(),
      });
    }
    const [workspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.projectId, project.id),
          eq(workspaces.name, ADOPTED.workspace),
        ),
      )
      .limit(1);
    if (!workspace) {
      // The workspace points at a repository one of these runs read, when
      // there is one, so running it again reads real code.
      const origins = loose.flatMap(
        (row) => (row.data as Partial<RunRecord>).source?.origin ?? [],
      );
      // A GitHub address before a local folder: the folder may be gone.
      const origin = origins.find((item) => item.kind === "github") ??
        origins[0] ?? { kind: "local", name: ADOPTED.workspace };
      await tx.insert(workspaces).values({
        id: randomUUID(),
        projectId: project.id,
        name: ADOPTED.workspace,
        origin,
        createdAt: new Date(),
      });
    }
    await tx
      .update(runs)
      .set({ projectId: project.id, workspaces: [ADOPTED.workspace] })
      .where(isNull(runs.projectId));
    return loose.length;
  });
}
