import { GitHubError, githubToken, pullState } from "../connectors/github";
import { issuesIn, setPullRequest } from "./store";

/*
 * Keeps fix pull requests current: a merged one moves its issue to
 * "merged, awaiting rescan"; one closed without merging puts the issue
 * back to open. There is no webhook (the app is local), so the app asks
 * when a page opens and every few minutes while it runs.
 */

export async function refreshPullRequests(
  projectId?: string,
): Promise<{ checked: number; merged: number; closed: number }> {
  if (!githubToken()) return { checked: 0, merged: 0, closed: 0 };
  const open = (await issuesIn(["pr_open"], projectId)).filter(
    (issue) => issue.pr,
  );
  let merged = 0;
  let closed = 0;
  for (const issue of open) {
    try {
      const now = await pullState(issue.pr!.repo, issue.pr!.number);
      if (now.state === "merged") {
        merged += 1;
        await setPullRequest(
          issue.id,
          { ...issue.pr!, state: "merged", mergedAt: now.mergedAt },
          "merged",
        );
      } else if (now.state === "closed") {
        closed += 1;
        await setPullRequest(
          issue.id,
          { ...issue.pr!, state: "closed" },
          "open",
        );
      }
    } catch (error) {
      // One unreachable pull request does not stop the others.
      if (!(error instanceof GitHubError)) throw error;
    }
  }
  return { checked: open.length, merged, closed };
}
