import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { issues } from "../db/schema";
import { runStore } from "../engine/registry";
import type { FindingType, RunRecord, Severity } from "../engine/schema";
import { getProject } from "../projects/store";
import { seenIn, type IssueState } from "./match";
import { reconcile } from "./reconcile";

/*
 * A project's tracked issues in the database. A finished project run is
 * reconciled into them (see reconcile.ts); a project whose issues were
 * never tracked is filled from its finished runs, oldest first.
 */

export interface PullRequest {
  /** "owner/name". */
  repo: string;
  number: number;
  url: string;
  branch: string;
  state: "open" | "merged" | "closed";
  mergedAt: string | null;
}

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  kind: FindingType;
  severity: Severity;
  state: IssueState;
  path: string | null;
  cwe: string | null;
  firstRunId: string | null;
  lastRunId: string | null;
  lastGroupId: string | null;
  verifiedRunId: string | null;
  pr: PullRequest | null;
  openedAt: string;
  updatedAt: string;
  fixedAt: string | null;
}

type Row = typeof issues.$inferSelect;

const toIssue = (row: Row): Issue => ({
  id: row.id,
  projectId: row.projectId,
  title: row.title,
  kind: row.kind as FindingType,
  severity: row.severity as Severity,
  state: row.state as IssueState,
  path: row.path,
  cwe: row.cwe,
  firstRunId: row.firstRunId,
  lastRunId: row.lastRunId,
  lastGroupId: row.lastGroupId,
  verifiedRunId: row.verifiedRunId,
  pr: (row.pr as PullRequest | null) ?? null,
  openedAt: row.openedAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  fixedAt: row.fixedAt?.toISOString() ?? null,
});

export async function listIssues(projectId?: string): Promise<Issue[]> {
  const rows = await db()
    .select()
    .from(issues)
    .where(projectId ? eq(issues.projectId, projectId) : undefined)
    .orderBy(asc(issues.openedAt));
  return rows.map(toIssue);
}

export async function getIssue(id: string): Promise<Issue | null> {
  const [row] = await db().select().from(issues).where(eq(issues.id, id));
  return row ? toIssue(row) : null;
}

/** The tracked issue a run's group became, if any. */
export async function issueForGroup(
  projectId: string,
  runId: string,
  groupId: string,
): Promise<Issue | null> {
  const [row] = await db()
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.projectId, projectId),
        eq(issues.lastRunId, runId),
        eq(issues.lastGroupId, groupId),
      ),
    );
  return row ? toIssue(row) : null;
}

export async function setPullRequest(
  id: string,
  pr: PullRequest,
  state: IssueState,
): Promise<void> {
  await db()
    .update(issues)
    .set({ pr, state, updatedAt: new Date() })
    .where(eq(issues.id, id));
}

/** Folds one finished project run into the project's tracked issues. */
export async function reconcileRun(run: RunRecord): Promise<void> {
  if (!run.projectId || run.status !== "completed") return;
  const project = await getProject(run.projectId);
  if (!project) return;
  const tracked = await listIssues(run.projectId);
  const seen = seenIn(run);
  const all = project.workspaces.map((item) => item.name);
  const read = run.workspaces?.length ? run.workspaces : all;
  const { updates, created } = reconcile(tracked, seen, { read, all });
  const at = new Date(run.updatedAt);

  await db().transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(issues)
        .set({
          state: update.state,
          updatedAt: at,
          ...(update.seen
            ? {
                title: update.seen.title,
                severity: update.seen.severity,
                path: update.seen.path,
                cwe: update.seen.cwe,
                lastRunId: run.id,
                lastGroupId: update.seen.groupId,
              }
            : {}),
          ...(update.state === "fixed"
            ? { verifiedRunId: run.id, fixedAt: at }
            : {}),
          ...(update.state === "reopened" ? { fixedAt: null } : {}),
        })
        .where(eq(issues.id, update.id));
    }
    if (created.length > 0) {
      await tx.insert(issues).values(
        created.map((item) => ({
          id: randomUUID(),
          projectId: run.projectId!,
          title: item.title,
          kind: item.kind,
          severity: item.severity,
          state: "open",
          path: item.path,
          cwe: item.cwe,
          firstRunId: run.id,
          lastRunId: run.id,
          lastGroupId: item.groupId,
          openedAt: at,
          updatedAt: at,
        })),
      );
    }
  });
}

/**
 * Makes sure a project's issues are tracked: when none are yet, its
 * finished runs are folded in, oldest first.
 */
export async function ensureTracked(projectId: string): Promise<void> {
  const [any] = await db()
    .select({ id: issues.id })
    .from(issues)
    .where(eq(issues.projectId, projectId))
    .limit(1);
  if (any) return;
  const store = runStore();
  const finished = (await store.list({ projectId }))
    .filter((item) => item.status === "completed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const summary of finished) {
    const run = await store.get(summary.id);
    if (run) await reconcileRun(run);
  }
}

/** Issues of these states, across projects or in one. */
export async function issuesIn(
  states: IssueState[],
  projectId?: string,
): Promise<Issue[]> {
  const rows = await db()
    .select()
    .from(issues)
    .where(
      and(
        inArray(issues.state, states),
        projectId ? eq(issues.projectId, projectId) : undefined,
      ),
    );
  return rows.map(toIssue);
}
