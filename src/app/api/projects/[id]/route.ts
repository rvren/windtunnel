import { getProject } from "@/server/projects/store";
import { deleteProjectAndRuns } from "@/server/runs/delete";
import { setSchedule } from "@/server/schedule/scheduler";

import { UUID, failure, readJson, withDatabase } from "../shared";

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
 * Sets the project's scheduled runs: `{ schedule: { every, hour,
 * monthlyCapUsd } }`. A schedule is the owner's standing permission for
 * those runs, inside the cap.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  const body = (await readJson(request)) as
    { schedule?: Record<string, unknown> } | undefined;
  const input = body?.schedule;
  const every = input?.every;
  const hour = Number(input?.hour);
  const cap =
    input?.monthlyCapUsd === null || input?.monthlyCapUsd === undefined
      ? null
      : Number(input.monthlyCapUsd);
  if (every !== "off" && every !== "daily" && every !== "weekly") {
    return failure("Choose off, daily or weekly.", 400);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return failure("Choose an hour from 0 to 23.", 400);
  }
  if (cap !== null && (!Number.isFinite(cap) || cap < 0 || cap > 100_000)) {
    return failure("Give a monthly cap in dollars, or none.", 400);
  }
  return withDatabase(async () => {
    const project = await getProject(id);
    if (!project) return failure("No such project.", 404);
    await setSchedule(id, { every, hour, monthlyCapUsd: cap });
    return Response.json({ project: await getProject(id) });
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
