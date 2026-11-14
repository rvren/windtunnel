import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import type { Stat } from "@/components/tuff/stat-grid";
import type { Cockpit } from "@/server/projects/cockpit";

/*
 * Turns a project's cockpit into what the tuffui widgets take. Pure. Trends
 * and changes come from the project's earlier runs; with none, there are none.
 */

/** One earlier finished run of the project, oldest first. */
export interface RunPoint {
  issues: number;
  workOrders: number;
}

/**
 * The change against the run before, as a plain difference ("+3"). A
 * percentage misleads when the run before was small.
 */
function change(now: number, before: number | undefined) {
  if (before === undefined) return {};
  const difference = now - before;
  return {
    delta: difference,
    change: difference > 0 ? `+${difference}` : String(difference),
  };
}

/** The cockpit's headline numbers, with change against the run before. */
export function cockpitStats(cockpit: Cockpit, earlier: RunPoint[]): Stat[] {
  const previous = earlier.at(-1);
  const trend = (pick: (point: RunPoint) => number, now: number) =>
    earlier.length ? [...earlier.map(pick), now] : undefined;
  const { totals } = cockpit;
  return [
    {
      id: "issues",
      label: "Issues",
      value: totals.issues.toLocaleString("en"),
      higherIsBetter: false,
      trend: trend((point) => point.issues, totals.issues),
      ...change(totals.issues, previous?.issues),
      hint: earlier.length ? "vs last run" : "First run",
    },
    ...SEVERITY_ORDER.map((severity): Stat => ({
      id: severity,
      label: SEVERITY_LABEL[severity],
      value: totals.bySeverity[severity].toLocaleString("en"),
      dot: `var(--sev-${severity})`,
      disabled: totals.bySeverity[severity] === 0,
    })),
    {
      id: "work-orders",
      label: "Work orders",
      value: totals.workOrders.toLocaleString("en"),
      higherIsBetter: false,
      trend: trend((point) => point.workOrders, totals.workOrders),
      ...change(totals.workOrders, previous?.workOrders),
    },
  ];
}
