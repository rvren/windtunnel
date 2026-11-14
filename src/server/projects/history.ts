import type { RunPoint } from "@/lib/viz/project";

import type { RunRecord, StoredEvent } from "../engine/schema";
import type { RunStore } from "../engine/store";

/** What a run's widgets need beyond the run itself: its events and its past. */
export interface RunHistory {
  events: StoredEvent[];
  /** The project's earlier finished runs, oldest first. */
  earlier: RunPoint[];
}

export async function runHistory(
  store: RunStore,
  run: RunRecord,
): Promise<RunHistory> {
  const events = await store.events(run.id);
  if (!run.projectId) return { events, earlier: [] };
  const earlierRuns = (await store.list({ projectId: run.projectId }))
    .filter(
      (item) =>
        item.id !== run.id &&
        item.status === "completed" &&
        item.createdAt < run.createdAt,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    events,
    earlier: earlierRuns.map((item) => ({
      issues: item.findingCount,
      workOrders: item.workOrderCount,
    })),
  };
}
