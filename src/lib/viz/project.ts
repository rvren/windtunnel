/*
 * What the cockpit reads from a project's earlier runs.
 */

/** One earlier finished run of the project, oldest first. */
export interface RunPoint {
  issues: number;
  workOrders: number;
}
