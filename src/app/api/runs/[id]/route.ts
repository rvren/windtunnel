import { ensureDatabase } from "@/server/db/ready";
import { isActive, runStore } from "@/server/engine/registry";
import { deleteRuns } from "@/server/runs/delete";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: RouteContext<"/api/runs/[id]">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) {
    return Response.json({ error: "No such run." }, { status: 404 });
  }
  try {
    await ensureDatabase();
    const run = await runStore().get(id);
    if (!run) return Response.json({ error: "No such run." }, { status: 404 });
    return Response.json({ run, live: isActive(id) });
  } catch {
    return Response.json(
      { error: "The database is not reachable." },
      { status: 503 },
    );
  }
}

/** Deletes the run, unless it is still in progress. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/runs/[id]">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) {
    return Response.json({ error: "No such run." }, { status: 404 });
  }
  try {
    await ensureDatabase();
  } catch {
    return Response.json(
      { error: "The database is not reachable." },
      { status: 503 },
    );
  }
  if (!(await runStore().get(id))) {
    return Response.json({ error: "No such run." }, { status: 404 });
  }
  const result = await deleteRuns([id]);
  return result.ok
    ? Response.json({ runs: result.runs })
    : Response.json({ error: result.error }, { status: result.status });
}
