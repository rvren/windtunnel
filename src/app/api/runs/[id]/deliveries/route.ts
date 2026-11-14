import { connection } from "next/server";

import { deliverRun } from "@/server/connectors/deliver";
import { SOFTWARE_FACTORY } from "@/server/connectors/software-factory";
import {
  getConnection,
  getProjectLink,
  listDeliveries,
} from "@/server/connectors/store";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (error: string, status: number) =>
  Response.json({ error }, { status });

async function state(runId: string, projectId: string | undefined) {
  const [link, current, deliveries] = await Promise.all([
    projectId ? getProjectLink(projectId, SOFTWARE_FACTORY) : null,
    getConnection(SOFTWARE_FACTORY),
    listDeliveries(runId, SOFTWARE_FACTORY),
  ]);
  return {
    /** Whether the run's project sends to 8090 at all. */
    linked: Boolean(link),
    connected: current.status === "connected",
    deliveries,
  };
}

/** What was sent to 8090 for this run's work orders. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/runs/[id]/deliveries">,
) {
  await connection();
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such run.", 404);
  try {
    await ensureDatabase();
    const run = await runStore().get(id);
    if (!run) return failure("No such run.", 404);
    return Response.json(await state(id, run.projectId));
  } catch {
    return failure("The database is not reachable.", 503);
  }
}

/** Sends the work orders that are not in 8090 yet. A person asked for it. */
export async function POST(
  _request: Request,
  context: RouteContext<"/api/runs/[id]/deliveries">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such run.", 404);
  try {
    await ensureDatabase();
    const run = await runStore().get(id);
    if (!run) return failure("No such run.", 404);
    const outcome = await deliverRun(run, { manual: true });
    if ("skipped" in outcome) return failure(outcome.skipped, 409);
    return Response.json({ ...outcome, ...(await state(id, run.projectId)) });
  } catch (error) {
    console.error("[windtunnel] Work orders could not be sent:", error);
    return failure("The work orders could not be sent.", 500);
  }
}
