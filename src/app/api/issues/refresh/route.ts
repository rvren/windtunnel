import { refreshPullRequests } from "@/server/issues/pull-status";

import { failure, readJson, withDatabase } from "../../projects/shared";

/** Asks GitHub where each open fix pull request is, and records it. */
export async function POST(request: Request) {
  const body = ((await readJson(request)) ?? {}) as { projectId?: unknown };
  const projectId =
    typeof body.projectId === "string" ? body.projectId : undefined;
  if (projectId !== undefined && projectId.length > 64) {
    return failure("No such project.", 404);
  }
  return withDatabase(async () =>
    Response.json(await refreshPullRequests(projectId)),
  );
}
