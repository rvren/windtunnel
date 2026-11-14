import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { AGENT_IDS } from "@/lib/agents";

import type { Database } from "../db/client";
import { agentReports, runEvents, runs } from "../db/schema";
import type {
  AgentRun,
  RunEvent,
  RunRecord,
  RunSummary,
  StoredEvent,
} from "./schema";

/*
 * Where runs live. The engine only knows this interface. Postgres is the real
 * store; the in-memory one is for unit tests.
 */
export interface RunStore {
  /** Inserts or replaces the run and its agent reports. */
  save(run: RunRecord): Promise<void>;
  get(id: string): Promise<RunRecord | null>;
  /** Newest first, narrowed by the filter. */
  list(filter?: RunFilter): Promise<RunSummary[]>;
  /** Removes runs, with their agent reports and events. */
  remove(ids: string[]): Promise<void>;
  appendEvent(runId: string, event: StoredEvent): Promise<void>;
  /** The run's events in order, optionally only those after `afterSeq`. */
  events(runId: string, afterSeq?: number): Promise<StoredEvent[]>;
  /**
   * Marks every run still "running" as "interrupted", except the ones in
   * `activeIds`. Called at server start, when nothing can be running.
   */
  markInterrupted(activeIds: string[]): Promise<number>;
}

export interface RunFilter {
  /** Only this project's runs. */
  projectId?: string;
  /** Only runs that read every one of these workspaces. */
  workspaces?: string[];
}

function summarize(run: RunRecord): RunSummary {
  return {
    id: run.id,
    projectId: run.projectId ?? null,
    parentRunId: run.parentRunId ?? null,
    createdAt: run.createdAt,
    status: run.status,
    stage: run.stage,
    title: run.title,
    findingCount: run.groups.length,
    workOrderCount: run.workOrders.length,
    workspaces: run.workspaces ?? [],
  };
}

const INTERRUPTED = "The server stopped while this run was in progress.";

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly log = new Map<string, StoredEvent[]>();

  async save(run: RunRecord) {
    this.runs.set(run.id, structuredClone(run));
  }

  async get(id: string) {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async list(filter: RunFilter = {}) {
    return [...this.runs.values()]
      .filter(
        (run) =>
          (!filter.projectId || run.projectId === filter.projectId) &&
          (filter.workspaces ?? []).every((name) =>
            (run.workspaces ?? []).includes(name),
          ),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(summarize);
  }

  async remove(ids: string[]) {
    for (const id of ids) {
      this.runs.delete(id);
      this.log.delete(id);
    }
  }

  async appendEvent(runId: string, event: StoredEvent) {
    const events = this.log.get(runId) ?? [];
    events.push(structuredClone(event));
    this.log.set(runId, events);
  }

  async events(runId: string, afterSeq = 0) {
    return (this.log.get(runId) ?? [])
      .filter((event) => event.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq);
  }

  async markInterrupted(activeIds: string[]) {
    let count = 0;
    for (const run of this.runs.values()) {
      if (run.status !== "running" || activeIds.includes(run.id)) continue;
      run.status = "interrupted";
      run.error = INTERRUPTED;
      count += 1;
    }
    return count;
  }
}

/** The run without its agents, which have their own table. */
type RunData = Omit<RunRecord, "agents">;

export class PgRunStore implements RunStore {
  constructor(private readonly db: Database) {}

  async save(run: RunRecord) {
    const { agents, ...data } = run;
    const row = {
      id: run.id,
      projectId: run.projectId ?? null,
      parentRunId: run.parentRunId ?? null,
      createdAt: new Date(run.createdAt),
      updatedAt: new Date(run.updatedAt),
      status: run.status,
      stage: run.stage,
      title: run.title,
      findingCount: run.groups.length,
      workOrderCount: run.workOrders.length,
      error: run.error,
      workspaces: run.workspaces ?? [],
      data,
    };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(runs)
        .values(row)
        .onConflictDoUpdate({ target: runs.id, set: row });
      for (const agent of agents) {
        const agentRow = {
          runId: run.id,
          agentId: agent.agentId,
          status: agent.status,
          data: agent,
        };
        await tx
          .insert(agentReports)
          .values(agentRow)
          .onConflictDoUpdate({
            target: [agentReports.runId, agentReports.agentId],
            set: { status: agentRow.status, data: agentRow.data },
          });
      }
    });
  }

  async get(id: string) {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, id));
    if (!row) return null;
    const reports = await this.db
      .select()
      .from(agentReports)
      .where(eq(agentReports.runId, id));
    const order = AGENT_IDS as readonly string[];
    const agents = reports
      .map((report) => report.data as AgentRun)
      .sort((a, b) => order.indexOf(a.agentId) - order.indexOf(b.agentId));
    return {
      ...(row.data as RunData),
      // The columns are the truth for what they hold.
      projectId: row.projectId ?? undefined,
      parentRunId: row.parentRunId ?? undefined,
      ...(row.projectId ? { workspaces: row.workspaces as string[] } : {}),
      status: row.status as RunRecord["status"],
      stage: row.stage as RunRecord["stage"],
      error: row.error,
      agents,
    };
  }

  async remove(ids: string[]) {
    if (ids.length === 0) return;
    // Agent reports and events go with the run (on delete cascade).
    await this.db.delete(runs).where(inArray(runs.id, ids));
  }

  async list(filter: RunFilter = {}) {
    const wanted = filter.workspaces ?? [];
    const rows = await this.db
      .select({
        id: runs.id,
        projectId: runs.projectId,
        parentRunId: runs.parentRunId,
        createdAt: runs.createdAt,
        status: runs.status,
        stage: runs.stage,
        title: runs.title,
        findingCount: runs.findingCount,
        workOrderCount: runs.workOrderCount,
        workspaces: runs.workspaces,
      })
      .from(runs)
      .where(
        and(
          filter.projectId ? eq(runs.projectId, filter.projectId) : undefined,
          wanted.length > 0
            ? sql`${runs.workspaces} @> ${JSON.stringify(wanted)}::jsonb`
            : undefined,
        ),
      )
      .orderBy(desc(runs.createdAt))
      .limit(200);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      workspaces: row.workspaces as string[],
      status: row.status as RunSummary["status"],
      stage: row.stage as RunSummary["stage"],
    }));
  }

  async appendEvent(runId: string, event: StoredEvent) {
    await this.db.insert(runEvents).values({
      runId,
      seq: event.seq,
      at: new Date(event.at),
      event: event.event,
    });
  }

  async events(runId: string, afterSeq = 0) {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq)))
      .orderBy(asc(runEvents.seq));
    return rows.map((row) => ({
      seq: row.seq,
      at: row.at.toISOString(),
      event: row.event as RunEvent,
    }));
  }

  async markInterrupted(activeIds: string[]) {
    const running = await this.db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.status, "running"));
    const ids = running
      .map((row) => row.id)
      .filter((id) => !activeIds.includes(id));
    if (ids.length === 0) return 0;
    await this.db
      .update(runs)
      .set({ status: "interrupted", error: INTERRUPTED, updatedAt: new Date() })
      .where(inArray(runs.id, ids));
    return ids.length;
  }
}
