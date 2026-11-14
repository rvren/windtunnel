import { GitHubError } from "@/server/connectors/github";
import { runStore } from "@/server/engine/registry";
import {
  createPullRequests,
  previewPullRequests,
} from "@/server/issues/pull-request";
import { getIssue } from "@/server/issues/store";

import { UUID, failure, readJson, withDatabase } from "../../../projects/shared";

/**
 * A pull request for a tracked issue's fix. "preview" (the default) checks
 * every edit against the base branch and writes nothing. "create" opens the
 * branch, the commit and the pull request: the app only sends it after a
 * person confirms. Windtunnel never merges.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/issues/[id]/pr">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such issue.", 404);
  const body = ((await readJson(request)) ?? {}) as { action?: unknown };
  const action = body.action === "create" ? "create" : "preview";

  return withDatabase(async () => {
    const issue = await getIssue(id);
    if (!issue) return failure("No such issue.", 404);
    if (issue.pr && issue.state === "pr_open") {
      return failure("This issue already has an open pull request.", 409);
    }
    const run = issue.lastRunId ? await runStore().get(issue.lastRunId) : null;
    const group = run?.groups.find((item) => item.id === issue.lastGroupId);
    if (!run || !group)
      return failure("The run behind this issue is gone.", 404);
    const record = run.remediations?.[group.id];
    if (!record || record.status !== "made" || record.edits.length === 0) {
      return Response.json(
        {
          needsFix: true,
          reason: "There is no checked patch for this issue yet.",
        },
        { status: 409 },
      );
    }
    try {
      if (action === "preview") {
        const { preview } = await previewPullRequests(run, group, record);
        return Response.json({ preview });
      }
      const { created, preview } = await createPullRequests(
        issue,
        run,
        group,
        record,
      );
      if (created.length === 0) {
        return Response.json({ preview, created }, { status: 409 });
      }
      return Response.json({ preview, created });
    } catch (error) {
      if (error instanceof GitHubError) return failure(error.message, 502);
      throw error;
    }
  });
}
