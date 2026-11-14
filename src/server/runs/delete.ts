import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { runs } from "../db/schema";
import { isActive, runStore } from "../engine/registry";
import { deleteProject } from "../projects/store";

/*
 * Deleting runs, and a project with or without its runs. A run still in
 * progress is never deleted: it would go on writing to a run that is gone.
 * A run's events, agent reports and deliveries go with it; tracked issues
 * and later versions that point at it stay, unlinked.
 */

export type DeleteResult =
  { ok: true; runs: number } | { ok: false; error: string; status: number };

const STILL_RUNNING =
  "A run is still in progress. Wait for it to finish, then delete it.";

export async function deleteRuns(ids: string[]): Promise<DeleteResult> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: true, runs: 0 };
  if (unique.some(isActive)) {
    return { ok: false, error: STILL_RUNNING, status: 409 };
  }
  await runStore().remove(unique);
  return { ok: true, runs: unique.length };
}

/** The ids of a project's runs. */
export async function runIdsOf(projectId: string): Promise<string[]> {
  const rows = await db()
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.projectId, projectId));
  return rows.map((row) => row.id);
}

/** Deletes the project; with `withRuns`, every run of it first. */
export async function deleteProjectAndRuns(
  projectId: string,
  withRuns: boolean,
): Promise<DeleteResult> {
  let count = 0;
  if (withRuns) {
    const removed = await deleteRuns(await runIdsOf(projectId));
    if (!removed.ok) return removed;
    count = removed.runs;
  }
  await deleteProject(projectId);
  return { ok: true, runs: count };
}
