import { deleteRuns } from "@/server/runs/delete";

import { UUID, failure, readJson, withDatabase } from "../../projects/shared";

/** Deletes several runs: `{ ids: string[] }`. Nothing is deleted if one is still in progress. */
export async function POST(request: Request) {
  const body = (await readJson(request)) as { ids?: unknown } | undefined;
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids || ids.length === 0 || ids.length > 200) {
    return failure("Choose between 1 and 200 runs.", 400);
  }
  if (
    !ids.every((id): id is string => typeof id === "string" && UUID.test(id))
  ) {
    return failure("One of those is not a run.", 400);
  }
  return withDatabase(async () => {
    const result = await deleteRuns(ids);
    return result.ok
      ? Response.json({ runs: result.runs })
      : failure(result.error, result.status);
  });
}
