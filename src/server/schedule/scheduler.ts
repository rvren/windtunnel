import { and, desc, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";

import { db } from "../db/client";
import { projects, runs } from "../db/schema";
import { RunError } from "../engine/llm";
import { isActive, startRun } from "../engine/registry";
import { getProject, type ProjectSchedule } from "../projects/store";
import { followingRun, mayStart, monthStart, nextRunAt } from "./plan";

/*
 * Scheduled runs. A project's owner sets a schedule and a monthly cap; that
 * setting is their standing permission for those runs, and only inside the
 * cap. A loop in the server process checks every minute, claims each due
 * project atomically (so a reload or a second process never starts a run
 * twice), and starts an audit of all its code, or records why not.
 */

const EVERY_MS = 60_000;

/** Saves a project's schedule and works out its next run. */
export async function setSchedule(
  projectId: string,
  input: Pick<ProjectSchedule, "every" | "hour" | "monthlyCapUsd">,
  now = new Date(),
): Promise<void> {
  await db()
    .update(projects)
    .set({
      schedule: input.every,
      scheduleHour: input.hour,
      monthlyCapUsd: input.monthlyCapUsd,
      nextRunAt: nextRunAt(input.every, input.hour, now),
      scheduleNote: null,
    })
    .where(eq(projects.id, projectId));
}

/** What a project's runs cost since the start of the month, in USD. */
export async function spentThisMonth(
  projectId: string,
  now = new Date(),
): Promise<number> {
  const [row] = await db()
    .select({ total: sql<number>`coalesce(sum(${runs.costUsd}), 0)` })
    .from(runs)
    .where(
      and(eq(runs.projectId, projectId), gte(runs.createdAt, monthStart(now))),
    );
  return Number(row?.total ?? 0);
}

/** What the project's last finished audit of its code cost, if known. */
async function lastAuditCost(projectId: string): Promise<number | null> {
  const [row] = await db()
    .select({ cost: runs.costUsd })
    .from(runs)
    .where(
      and(
        eq(runs.projectId, projectId),
        eq(runs.kind, "audit"),
        eq(runs.status, "completed"),
        isNotNull(runs.costUsd),
        sql`jsonb_array_length(${runs.workspaces}) > 0`,
      ),
    )
    .orderBy(desc(runs.createdAt))
    .limit(1);
  return row?.cost ?? null;
}

/** Claims the projects whose run is due, moving each one's next run on. */
export async function claimDue(now = new Date()): Promise<string[]> {
  const due = await db()
    .select({
      id: projects.id,
      every: projects.schedule,
      hour: projects.scheduleHour,
      nextRunAt: projects.nextRunAt,
    })
    .from(projects)
    .where(and(ne(projects.schedule, "off"), lte(projects.nextRunAt, now)));
  const claimed: string[] = [];
  for (const item of due) {
    if (!item.nextRunAt) continue;
    const next = followingRun(
      item.every as ProjectSchedule["every"],
      item.hour,
      now,
    );
    // Only the process that moves next_run_at from the value it read wins.
    const won = await db()
      .update(projects)
      .set({ nextRunAt: next })
      .where(
        and(eq(projects.id, item.id), eq(projects.nextRunAt, item.nextRunAt)),
      )
      .returning({ id: projects.id });
    if (won.length > 0) claimed.push(item.id);
  }
  return claimed;
}

async function note(projectId: string, text: string | null) {
  await db()
    .update(projects)
    .set({ scheduleNote: text })
    .where(eq(projects.id, projectId));
}

/** Starts one claimed project's scheduled run, or records why not. */
export async function runScheduled(
  projectId: string,
  now = new Date(),
): Promise<string | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  if (project.workspaces.length === 0) {
    await note(projectId, "Skipped: the project has no workspace to read.");
    return null;
  }
  const running = await db()
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), eq(runs.status, "running")));
  if (running.some((item) => isActive(item.id))) {
    await note(projectId, "Skipped: a run of this project was still going.");
    return null;
  }
  const allowed = mayStart({
    capUsd: project.schedule.monthlyCapUsd,
    spentUsd: await spentThisMonth(projectId, now),
    lastRunUsd: await lastAuditCost(projectId),
    free: project.demo,
  });
  if (!allowed.ok) {
    await note(projectId, allowed.note);
    return null;
  }
  try {
    const run = await startRun({
      requirement: project.description,
      documents: [],
      project: {
        id: project.id,
        name: project.name,
        demo: project.demo,
        workspaces: project.workspaces.map(({ name, origin }) => ({
          name,
          origin,
        })),
      },
    });
    await note(projectId, null);
    return run.id;
  } catch (error) {
    await note(
      projectId,
      `Skipped: ${error instanceof RunError ? error.message : "the run could not be started."}`,
    );
    return null;
  }
}

/** One pass: every due project, claimed and started. */
export async function tick(now = new Date()): Promise<void> {
  for (const id of await claimDue(now)) {
    await runScheduled(id, now).catch((error) =>
      console.error("[windtunnel] A scheduled run failed to start:", error),
    );
  }
}

/** Starts the loop once per server process. */
export function startScheduler(): void {
  const holder = globalThis as typeof globalThis & {
    windtunnelScheduler?: ReturnType<typeof setInterval>;
  };
  if (holder.windtunnelScheduler) return;
  holder.windtunnelScheduler = setInterval(() => {
    tick().catch((error) =>
      console.error("[windtunnel] The scheduler could not run:", error),
    );
  }, EVERY_MS);
  holder.windtunnelScheduler.unref?.();
}
