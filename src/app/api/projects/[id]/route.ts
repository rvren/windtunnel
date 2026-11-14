import { getProject } from "@/server/projects/store";
import { deleteProjectAndRuns } from "@/server/runs/delete";

import { UUID, failure, withDatabase } from "../shared";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  return withDatabase(async () => {
    const project = await getProject(id);
    return project
      ? Response.json({ project })
      : failure("No such project.", 404);
  });
}

/**
 * Removes the project and its workspaces. With `?runs=1` its runs go too;
 * otherwise they stay in the list of runs.
 */
export async function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  const withRuns = new URL(request.url).searchParams.get("runs") === "1";
  return withDatabase(async () => {
    const result = await deleteProjectAndRuns(id, withRuns);
    return result.ok
      ? Response.json({ runs: result.runs })
      : failure(result.error, result.status);
  });
}
