import {
  matchIssues,
  type IssueState,
  type SeenIssue,
  type TrackedIssue,
} from "./match";

/*
 * What one finished run changes about a project's tracked issues. Pure:
 * it returns the changes; the store writes them.
 *
 * - Seen again: stays open (or its PR stays open); found again after its
 *   fix was merged, or after it had gone, it is reopened.
 * - New: opened.
 * - Not seen: a merged fix is confirmed (fixed); anything else open is
 *   "gone" (not found again). Only issues this run could have seen count:
 *   one in a workspace the run did not read is left alone.
 */

export interface Reconciled {
  updates: {
    id: string;
    state: IssueState;
    seen: SeenIssue | null;
  }[];
  created: SeenIssue[];
}

const LIVE: IssueState[] = ["open", "pr_open", "merged", "reopened"];

/** Whether a run that read these workspaces could have seen this issue. */
export function inScope(
  path: string | null,
  read: string[],
  all: string[],
): boolean {
  if (all.length <= 1) return true;
  const everything = all.every((name) => read.includes(name));
  if (!path) return everything;
  const workspace = path.split("/")[0];
  return read.includes(workspace);
}

export function reconcile(
  tracked: TrackedIssue[],
  seen: SeenIssue[],
  scope: { read: string[]; all: string[] },
): Reconciled {
  const { matched, fresh, missing } = matchIssues(tracked, seen);
  const updates: Reconciled["updates"] = [];

  for (const issue of tracked) {
    const again = matched.get(issue.id);
    if (!again) continue;
    const state: IssueState =
      issue.state === "merged" ||
      issue.state === "fixed" ||
      issue.state === "gone"
        ? "reopened"
        : issue.state;
    updates.push({ id: issue.id, state, seen: again });
  }

  for (const issue of missing) {
    if (!LIVE.includes(issue.state)) continue;
    if (!inScope(issue.path, scope.read, scope.all)) continue;
    updates.push({
      id: issue.id,
      state: issue.state === "merged" ? "fixed" : "gone",
      seen: null,
    });
  }

  return { updates, created: fresh };
}
