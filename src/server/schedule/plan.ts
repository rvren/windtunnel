import type { ProjectSchedule } from "../projects/store";

/*
 * When a scheduled run is due, and whether it may start. Pure: the clock
 * and the spending are handed in.
 */

const DAY = 24 * 60 * 60 * 1000;

/**
 * The next time a schedule runs after `from`: the next time the clock
 * reaches its hour (server time).
 */
export function nextRunAt(
  every: ProjectSchedule["every"],
  hour: number,
  from: Date,
): Date | null {
  if (every === "off") return null;
  const next = new Date(from);
  next.setMinutes(0, 0, 0);
  next.setHours(hour);
  if (next.getTime() <= from.getTime()) {
    next.setTime(next.getTime() + DAY);
  }
  return next;
}

/** After a scheduled run starts (or is skipped): when the next one is. */
export function followingRun(
  every: ProjectSchedule["every"],
  hour: number,
  ranAt: Date,
): Date | null {
  const next = nextRunAt(every, hour, ranAt);
  if (next && every === "weekly") next.setTime(next.getTime() + 6 * DAY);
  return next;
}

/** The first moment of the month `at` is in. */
export function monthStart(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), 1);
}

/**
 * Whether a scheduled run may start: this month's spending plus what the
 * last comparable run cost (the best estimate of the next) must stay under
 * the cap. A free run (a sample project) always may.
 */
export function mayStart(input: {
  capUsd: number | null;
  spentUsd: number;
  lastRunUsd: number | null;
  free: boolean;
}): { ok: true } | { ok: false; note: string } {
  if (input.free || input.capUsd === null) return { ok: true };
  const estimate = input.lastRunUsd ?? 0;
  if (input.spentUsd + estimate > input.capUsd) {
    const last =
      input.lastRunUsd !== null
        ? ` and the last one $${input.lastRunUsd.toFixed(2)}`
        : "";
    return {
      ok: false,
      note: `Skipped: this month's runs cost $${input.spentUsd.toFixed(2)}${last}, against a cap of $${input.capUsd.toFixed(2)}.`,
    };
  }
  return { ok: true };
}
